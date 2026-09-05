import 'server-only';
import { eq } from 'drizzle-orm';
import { db, posts, categories } from '@/db';
import { getSettings, isOn } from '@/lib/settings';
import { truncate, stripMarkdown, wordCount } from '@/lib/util';
import { logInfo, logWarn, errMessage } from '@/lib/log';
import { generateJson, pickProviders } from '@/providers';
import { fill } from './prompts';
import { refreshPostDerived } from './generate';
import { reviewPost } from './policy-runner';
import type { PolicyIssue, PolicyReport } from './adsense-policy';

/**
 * Repairs the AdSense policy findings on an article.
 *
 * Deterministic edits run first and need no provider — disclaimers, affiliate
 * disclosure, de-duplicated sentences, a de-clickbaited title. Everything that
 * needs judgement (expanding a thin page, rewriting a restricted passage,
 * qualifying a claim) goes to the model with the specific findings attached.
 *
 * Every change is additive or a targeted replacement. Nothing is deleted
 * wholesale, and the article is re-screened afterwards so the recorded verdict
 * always reflects what is now on the page.
 */

export type FixResult = {
  applied: string[];
  skipped: string[];
  before: string;
  after: string;
  words: { before: number; after: number };
};

const DISCLAIMERS: Record<string, string> = {
  'ymyl-medical':
    '> **This article is not medical advice.** It is general information for a lay reader. Talk to a doctor or qualified healthcare professional about your own situation before acting on anything here.',
  'ymyl-financial':
    '> **This article is not financial advice.** It is general information, not a recommendation. Speak to a qualified financial adviser before making a decision with your money.',
  'ymyl-legal':
    '> **This article is not legal advice.** Laws vary by jurisdiction and change over time. Consult a qualified solicitor or attorney about your own circumstances.',
};

const AFFILIATE_DISCLOSURE =
  '_Some links in this article are affiliate links. If you buy through them we may earn a commission, at no extra cost to you. It does not affect which products we recommend._';

export const POLICY_FIX_PROMPT = `You are editing an article so it complies with Google AdSense programme policies.

Title: {{title}}
Category: {{category}}
Current length: {{words}} words

Policy findings to resolve:
{{issues}}

Article (Markdown):
{{content}}

Return JSON only:
{
  "title": "a replacement title, or an empty string to keep the current one",
  "rewriteIntro": "a replacement opening paragraph, or an empty string to keep it",
  "replacements": [
    { "find": "exact text from the article to replace", "replace": "the compliant rewrite", "why": "which finding this resolves" }
  ],
  "addSections": [
    { "afterHeading": "an existing H2 to insert after, or empty string for the end", "markdown": "a complete new ## section in Markdown" }
  ],
  "actions": ["short human-readable list of what you changed"]
}

Rules:
- If the article is flagged as thin, add enough genuinely useful sections to carry it past 750 words. Real detail — specifics, numbers, steps, comparisons. Do not pad with restatements of what is already there; repetition is itself a policy violation.
- If restricted subject matter is flagged, rewrite those passages so the article no longer promotes, instructs or advertises the restricted thing. Covering a topic factually is fine; telling someone how to do it is not.
- If an unsupported medical or financial claim is flagged, replace the guarantee with an accurate, qualified statement. Never simply delete the sentence and leave a gap.
- Every "find" string must appear in the article exactly as written, and be long enough to be unambiguous.
- Do not touch anything the findings do not mention.
- Keep the existing voice, formatting and Markdown structure.`;

export async function fixPolicyIssues(
  postId: number,
  opts: { useAi?: boolean } = {},
): Promise<FixResult> {
  const [post] = await db.select().from(posts).where(eq(posts.id, postId));
  if (!post) throw new Error('Post not found');

  const s = await getSettings();
  const issues = JSON.parse(post.policyIssues || '[]') as PolicyIssue[];
  const before = post.contentMd;
  const applied: string[] = [];
  const skipped: string[] = [];

  let markdown = before;
  let title = post.title;

  /* ------------------------------------------------ deterministic fixes */

  // YMYL disclaimers — a fixed, accurate line beats anything a model invents.
  for (const issue of issues) {
    const disclaimer = DISCLAIMERS[issue.id];
    if (!disclaimer) continue;
    if (markdown.includes(disclaimer.slice(0, 40))) continue;
    markdown = `${disclaimer}\n\n${markdown}`;
    applied.push(`Added a ${issue.id.replace('ymyl-', '')} disclaimer`);
  }

  if (issues.some((i) => i.id === 'affiliate-undisclosed') && !markdown.includes('affiliate links')) {
    markdown = `${AFFILIATE_DISCLOSURE}\n\n${markdown}`;
    applied.push('Added an affiliate disclosure');
  }

  if (issues.some((i) => i.id === 'repetition')) {
    const deduped = dedupeSentences(markdown);
    if (deduped.removed > 0) {
      markdown = deduped.markdown;
      applied.push(`Removed ${deduped.removed} repeated sentence(s)`);
    }
  }

  if (issues.some((i) => i.id === 'clickbait')) {
    const cleaned = deClickbait(title);
    if (cleaned !== title) {
      title = cleaned;
      applied.push('Removed clickbait phrasing from the title');
    }
  }

  // Site-wide switches cannot be repaired from inside one article.
  if (issues.some((i) => i.id === 'no-ai-disclosure')) {
    skipped.push('The AI disclosure is a site setting — turn it on in Settings → Generation');
  }

  /* -------------------------------------------------------- AI rewrites */

  const needsJudgement = issues.filter(
    (i) => !DISCLAIMERS[i.id] && !['affiliate-undisclosed', 'repetition', 'clickbait', 'no-ai-disclosure', 'image-alt'].includes(i.id),
  );

  if (needsJudgement.length && opts.useAi !== false) {
    const chain = await pickProviders('text');
    if (!chain.length) {
      skipped.push('No text provider configured — the content rewrites need one');
    } else {
      const category = post.categoryId
        ? (await db.select().from(categories).where(eq(categories.id, post.categoryId)))[0]
        : null;

      try {
        const { data } = await generateJson<{
          title?: string;
          rewriteIntro?: string;
          replacements?: { find: string; replace: string; why?: string }[];
          addSections?: { afterHeading?: string; markdown: string }[];
          actions?: string[];
        }>(
          {
            prompt: fill(POLICY_FIX_PROMPT, {
              title,
              category: category?.name || 'Blog',
              words: wordCount(stripMarkdown(markdown)),
              issues: needsJudgement
                .map((i) => `- [${i.severity}] ${i.policy} — ${i.title}: ${i.detail}\n  Remedy: ${i.remedy}`)
                .join('\n'),
              content: truncate(markdown, 9000),
            }),
            maxTokens: 6000,
            temperature: 0.5,
          },
          { scope: 'policy-fix' },
        );

        if (data.title && data.title.length > 10 && data.title !== title) {
          title = data.title;
          applied.push('Rewrote the title');
        }

        if (data.rewriteIntro && data.rewriteIntro.length > 80) {
          markdown = replaceIntro(markdown, data.rewriteIntro);
          applied.push('Rewrote the opening paragraph');
        }

        for (const r of data.replacements || []) {
          if (!r?.find || !r?.replace || r.find.length < 12) continue;
          if (!markdown.includes(r.find)) {
            skipped.push(`Could not locate a passage the model wanted to rewrite: "${truncate(r.find, 50)}"`);
            continue;
          }
          markdown = markdown.replace(r.find, r.replace);
          applied.push(r.why ? `Rewrote a passage — ${r.why}` : 'Rewrote a non-compliant passage');
        }

        for (const section of data.addSections || []) {
          if (!section?.markdown || section.markdown.length < 150) continue;
          markdown = insertSection(markdown, section.afterHeading || '', section.markdown);
          applied.push(`Added section: ${firstHeading(section.markdown)}`);
        }

        for (const a of data.actions || []) {
          if (!applied.includes(a)) applied.push(a);
        }
      } catch (err) {
        await logWarn('policy-fix', 'Model rewrite failed', { error: errMessage(err) });
        skipped.push(`AI rewrite unavailable: ${errMessage(err)}`);
      }
    }
  }

  /* ------------------------------------------------------------- save */

  if (markdown !== before || title !== post.title) {
    const { renderMarkdown } = await import('@/lib/markdown');
    await db
      .update(posts)
      .set({
        title,
        contentMd: markdown,
        contentHtml: renderMarkdown(markdown).html,
        updatedAt: new Date(),
      })
      .where(eq(posts.id, postId));
    await refreshPostDerived(postId);
  }

  // Re-screen so the recorded verdict describes what is now on the page.
  await reviewPost(postId, { useAi: isOn(s['policy.aiReview']) });

  const wordsBefore = wordCount(stripMarkdown(before));
  const wordsAfter = wordCount(stripMarkdown(markdown));

  await logInfo('policy-fix', `Applied ${applied.length} policy fix(es) to "${title}"`, {
    postId, applied, skipped, wordsBefore, wordsAfter,
  });

  return {
    applied,
    skipped,
    before,
    after: markdown,
    words: { before: wordsBefore, after: wordsAfter },
  };
}

/* ---------------------------------------------------------------- utils */

/** Drop sentences that appear more than once, keeping the first occurrence. */
function dedupeSentences(md: string): { markdown: string; removed: number } {
  const seen = new Set<string>();
  let removed = 0;

  const lines = md.split('\n').map((line) => {
    // Leave headings, lists, tables and code alone — repetition there is normal.
    if (!line.trim() || /^[#>\-*|`\d]/.test(line.trim())) return line;

    const kept = line
      .split(/(?<=[.!?])\s+/)
      .filter((sentence) => {
        const key = sentence.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
        if (key.length < 30) return true;
        if (seen.has(key)) {
          removed++;
          return false;
        }
        seen.add(key);
        return true;
      })
      .join(' ');
    return kept;
  });

  return { markdown: lines.filter((l, i) => l.trim() || lines[i - 1]?.trim()).join('\n'), removed };
}

function deClickbait(title: string): string {
  return title
    .replace(/^you\s*won'?t believe\s*(this|that)?\s*[:—-]?\s*/i, '')
    .replace(/\bshocking\b\s*/gi, '')
    .replace(/\bthis one trick\b/gi, 'this method')
    .replace(/\bdoctors hate\b[^.,!?]*/gi, '')
    .replace(/\bnumber \d+ will\b[^.,!?]*/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s:—-]+|[\s:—-]+$/g, '')
    .trim() || title;
}

function replaceIntro(md: string, intro: string): string {
  const lines = md.split('\n');
  const first = lines.findIndex((l) => l.trim() && !/^[#>\-*|]/.test(l.trim()));
  if (first === -1) return `${intro}\n\n${md}`;
  let end = first;
  while (end < lines.length && lines[end].trim()) end++;
  return [...lines.slice(0, first), intro, ...lines.slice(end)].join('\n');
}

function insertSection(md: string, afterHeading: string, section: string): string {
  if (!afterHeading) return `${md.trimEnd()}\n\n${section.trim()}\n`;
  const lines = md.split('\n');
  const idx = lines.findIndex(
    (l) => /^#{2,3}\s/.test(l) && l.toLowerCase().includes(afterHeading.toLowerCase().slice(0, 30)),
  );
  if (idx === -1) return `${md.trimEnd()}\n\n${section.trim()}\n`;
  let next = idx + 1;
  while (next < lines.length && !/^##\s/.test(lines[next])) next++;
  return [...lines.slice(0, next), '', section.trim(), '', ...lines.slice(next)].join('\n');
}

function firstHeading(md: string): string {
  const m = md.match(/^#{2,3}\s+(.+)$/m);
  return m ? m[1].trim() : 'new section';
}

/** Which findings this fixer can actually act on. */
export function fixableIssues(issues: PolicyIssue[], hasTextProvider: boolean): PolicyIssue[] {
  return issues.filter((i) => {
    if (i.id === 'no-ai-disclosure') return false;
    if (DISCLAIMERS[i.id]) return true;
    if (['affiliate-undisclosed', 'repetition', 'clickbait'].includes(i.id)) return true;
    return hasTextProvider;
  });
}

export type { PolicyReport };
