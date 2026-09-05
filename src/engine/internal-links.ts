import 'server-only';
import { and, desc, eq, ne, sql } from 'drizzle-orm';
import { db, posts, internalLinks, type Post } from '@/db';
import { generateJson } from '@/providers';
import { renderMarkdown } from '@/lib/markdown';
import { stripMarkdown, truncate } from '@/lib/util';
import { fill, INTERNAL_LINK_PROMPT } from './prompts';
import { logInfo, logWarn, errMessage } from '@/lib/log';

export type LinkCandidate = { id: number; title: string; slug: string; focusKeyword: string };

/**
 * Insert links into `markdown` pointing at other published posts.
 *
 * Tries the model first (it picks anchors that read naturally), and falls back
 * to exact phrase matching so linking still works with no text provider or when
 * the model returns something unusable.
 */
export async function addInternalLinks(
  markdown: string,
  opts: {
    postId?: number;
    title: string;
    focusKeyword: string;
    max: number;
    excludeIds?: number[];
    useAi?: boolean;
  },
): Promise<{ markdown: string; links: { targetId: number; anchor: string }[] }> {
  if (opts.max <= 0) return { markdown, links: [] };

  const candidates = await findCandidates(opts.focusKeyword, opts.title, [
    ...(opts.excludeIds || []),
    ...(opts.postId ? [opts.postId] : []),
  ]);
  if (!candidates.length) return { markdown, links: [] };

  let chosen: { targetId: number; anchor: string }[] = [];

  if (opts.useAi !== false) {
    try {
      const { data } = await generateJson<{ links?: { targetId: number; anchor: string }[] }>(
        {
          prompt: fill(INTERNAL_LINK_PROMPT, {
            title: opts.title,
            keyword: opts.focusKeyword,
            content: truncate(stripMarkdown(markdown), 6000),
            candidates: candidates
              .map((c) => `- id ${c.id}: "${c.title}" (topic: ${c.focusKeyword || '—'})`)
              .join('\n'),
            max: opts.max,
          }),
          maxTokens: 1200,
          temperature: 0.3,
        },
        { scope: 'internal-links' },
      );
      chosen = (data.links || []).filter((l) => candidates.some((c) => c.id === l.targetId));
    } catch (err) {
      await logWarn('internal-links', 'AI link selection failed, falling back to phrase matching', {
        error: errMessage(err),
      });
    }
  }

  if (!chosen.length) chosen = phraseMatch(markdown, candidates, opts.max);

  const applied: { targetId: number; anchor: string }[] = [];
  let out = markdown;
  for (const link of chosen.slice(0, opts.max)) {
    const target = candidates.find((c) => c.id === link.targetId);
    if (!target) continue;
    if (applied.some((a) => a.targetId === target.id)) continue;
    const next = insertLink(out, link.anchor, `/blog/${target.slug}`);
    if (next) {
      out = next;
      applied.push({ targetId: target.id, anchor: link.anchor });
    }
  }

  if (opts.postId && applied.length) {
    await db.delete(internalLinks).where(eq(internalLinks.sourcePostId, opts.postId));
    await db.insert(internalLinks).values(
      applied.map((a) => ({ sourcePostId: opts.postId!, targetPostId: a.targetId, anchor: a.anchor })),
    );
  }

  return { markdown: out, links: applied };
}

/**
 * The other half of internal linking: give a brand-new post inbound links from
 * older articles. Without this every new post is an orphan until something
 * happens to mention it.
 */
export async function linkBackToNewPost(newPost: Post, maxSources = 3): Promise<number> {
  const phrase = (newPost.focusKeyword || newPost.title).toLowerCase();
  if (phrase.length < 8) return 0;

  const sources = await db
    .select()
    .from(posts)
    .where(and(eq(posts.status, 'published'), ne(posts.id, newPost.id)))
    .orderBy(desc(posts.publishedAt))
    .limit(60);

  let added = 0;
  for (const source of sources) {
    if (added >= maxSources) break;
    if (source.contentMd.includes(`/blog/${newPost.slug}`)) continue;

    const anchor = findAnchor(source.contentMd, phrase);
    if (!anchor) continue;
    const updated = insertLink(source.contentMd, anchor, `/blog/${newPost.slug}`);
    if (!updated) continue;

    const { html } = renderMarkdown(updated);
    await db
      .update(posts)
      .set({ contentMd: updated, contentHtml: html, updatedAt: new Date() })
      .where(eq(posts.id, source.id));
    await db.insert(internalLinks).values({
      sourcePostId: source.id,
      targetPostId: newPost.id,
      anchor,
    });
    added++;
  }
  if (added) {
    await logInfo('internal-links', `Added ${added} inbound link(s) to "${newPost.title}"`);
  }
  return added;
}

/* -------------------------------------------------------------- helpers */

async function findCandidates(
  keyword: string,
  title: string,
  exclude: number[],
): Promise<LinkCandidate[]> {
  const rows = await db
    .select({
      id: posts.id,
      title: posts.title,
      slug: posts.slug,
      focusKeyword: posts.focusKeyword,
    })
    .from(posts)
    .where(eq(posts.status, 'published'))
    .orderBy(desc(posts.publishedAt))
    .limit(80);

  const terms = new Set(
    `${keyword} ${title}`
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 3),
  );

  return rows
    .filter((r) => !exclude.includes(r.id))
    .map((r) => {
      const words = `${r.title} ${r.focusKeyword}`.toLowerCase().split(/\W+/);
      const overlap = words.filter((w) => terms.has(w)).length;
      return { ...r, overlap };
    })
    .sort((a, b) => b.overlap - a.overlap)
    .slice(0, 20)
    .map(({ id, title: t, slug, focusKeyword }) => ({ id, title: t, slug, focusKeyword }));
}

/**
 * Deterministic fallback, used when there is no text provider or the model
 * returns nothing usable.
 *
 * Matching only on the full focus keyword almost never hits — "burr vs blade
 * grinder" is a search query, not a phrase anyone writes mid-sentence. So each
 * target contributes several candidate anchors (keyword, title, then shorter
 * n-grams of both) and the longest one that actually appears wins.
 */
function phraseMatch(md: string, candidates: LinkCandidate[], max: number) {
  const out: { targetId: number; anchor: string }[] = [];
  const used = new Set<string>();

  for (const c of candidates) {
    if (out.length >= max) break;
    for (const phrase of anchorCandidates(c)) {
      if (used.has(phrase)) continue;
      const anchor = findAnchor(md, phrase);
      if (!anchor) continue;
      out.push({ targetId: c.id, anchor });
      used.add(phrase);
      break;
    }
  }
  return out;
}

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'without',
  'how', 'what', 'why', 'when', 'where', 'which', 'who', 'is', 'are', 'do', 'does',
  'can', 'your', 'my', 'it', 'that', 'this', 'vs', 'versus', 'at', 'by', 'from',
]);

/**
 * Phrases worth turning into a link to `target`, longest and most specific
 * first. Keeps only n-grams that start and end on a content word, so anchors
 * read naturally inside a sentence.
 */
export function anchorCandidates(target: LinkCandidate): string[] {
  const normalise = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim();

  const keyword = normalise(target.focusKeyword);
  // Titles often carry a parenthetical or subtitle — drop it.
  const title = normalise(target.title.replace(/\s*[([—:].*$/, ''));

  // Topic words the anchor has to touch, so a title never contributes something
  // generic like "ten minutes" that says nothing about where the link goes.
  const topic = new Set(keyword.split(' ').filter((w) => w.length > 2 && !STOPWORDS.has(w)));

  const seen = new Set<string>();
  const out: string[] = [];

  const collect = (source: string, requireTopic: boolean) => {
    if (!source) return;
    const words = source.split(' ');
    for (let size = Math.min(5, words.length); size >= 2; size--) {
      for (let i = 0; i + size <= words.length; i++) {
        const gram = words.slice(i, i + size);
        if (STOPWORDS.has(gram[0]) || STOPWORDS.has(gram[gram.length - 1])) continue;
        if (requireTopic && topic.size && !gram.some((w) => topic.has(w))) continue;
        const phrase = gram.join(' ');
        if (phrase.length < 8 || seen.has(phrase)) continue;
        seen.add(phrase);
        out.push(phrase);
      }
    }
  };

  collect(keyword, false);
  collect(title, true);

  // Longest first: a specific anchor is always the better link.
  return out.sort((a, b) => b.length - a.length);
}

/**
 * Find `phrase` in the body outside headings, code blocks and existing links.
 * Returns the matched text with its original casing.
 */
function findAnchor(md: string, phrase: string): string | null {
  if (!phrase || phrase.length < 6) return null;
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`\\b${escaped}\\b`, 'i');

  for (const line of md.split('\n')) {
    if (!line.trim() || line.trimStart().startsWith('#') || line.trimStart().startsWith('```')) continue;
    if (line.trimStart().startsWith('|')) continue; // tables render badly with links
    const m = re.exec(line);
    if (!m) continue;
    // Skip if the match sits inside an existing markdown link or image.
    const before = line.slice(0, m.index);
    if ((before.match(/\[/g) || []).length > (before.match(/\]/g) || []).length) continue;
    return m[0];
  }
  return null;
}

/** Replace the first standalone occurrence of `anchor` with a markdown link. */
function insertLink(md: string, anchor: string, href: string): string | null {
  if (!anchor) return null;
  const escaped = anchor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const lines = md.split('\n');
  let inFence = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trimStart().startsWith('```')) { inFence = !inFence; continue; }
    if (inFence) continue;
    if (!line.trim() || line.trimStart().startsWith('#') || line.trimStart().startsWith('|')) continue;
    if (line.includes(`](${href})`)) return null; // already linked in this doc

    const re = new RegExp(`(?<!\\[)\\b${escaped}\\b(?!\\]|\\()`, '');
    const m = re.exec(line);
    if (!m) continue;
    const before = line.slice(0, m.index);
    if ((before.match(/\[/g) || []).length > (before.match(/\]/g) || []).length) continue;

    lines[i] = `${line.slice(0, m.index)}[${m[0]}](${href})${line.slice(m.index + m[0].length)}`;
    return lines.join('\n');
  }
  return null;
}

/** Orphan report for the admin: published posts with no inbound internal links. */
export async function findOrphanPosts() {
  return db
    .select({
      id: posts.id,
      title: posts.title,
      slug: posts.slug,
      publishedAt: posts.publishedAt,
      inbound: sql<number>`(SELECT COUNT(*)::int FROM internal_links WHERE target_post_id = ${posts.id})`,
      outbound: sql<number>`(SELECT COUNT(*)::int FROM internal_links WHERE source_post_id = ${posts.id})`,
    })
    .from(posts)
    .where(eq(posts.status, 'published'))
    .orderBy(desc(posts.publishedAt));
}
