import 'server-only';
import { eq } from 'drizzle-orm';
import { db, posts, categories } from '@/db';
import { getSettings, isOn } from '@/lib/settings';
import { truncate } from '@/lib/util';
import { logInfo, logWarn, errMessage } from '@/lib/log';
import { generateJson, pickProviders } from '@/providers';
import { fill } from './prompts';
import {
  checkAdsensePolicy, mergeAiReview, POLICY_REVIEW_PROMPT,
  type PolicyReport, type PolicyIssue,
} from './adsense-policy';

/**
 * Runs the AdSense policy review for one article and records the verdict.
 *
 * The deterministic scan always runs. The model pass is additive and optional —
 * it can raise a verdict but never lower one, so a provider outage degrades the
 * check rather than silently passing something risky.
 */
export async function reviewPost(
  postId: number,
  opts: { useAi?: boolean; pinnedText?: number | null } = {},
): Promise<PolicyReport> {
  const [post] = await db.select().from(posts).where(eq(posts.id, postId));
  if (!post) throw new Error('Post not found');

  const s = await getSettings();
  const category = post.categoryId
    ? (await db.select().from(categories).where(eq(categories.id, post.categoryId)))[0]
    : null;

  const report = await runPolicyCheck(
    {
      title: post.title,
      contentMd: post.contentMd,
      excerpt: post.excerpt,
      metaDescription: post.metaDescription,
      category: category?.name ?? null,
      hasDisclosure: isOn(s['gen.disclosure']),
    },
    { useAi: opts.useAi ?? isOn(s['policy.aiReview']), pinnedText: opts.pinnedText ?? null },
  );

  await db
    .update(posts)
    .set({
      policyStatus: report.status,
      policyIssues: JSON.stringify(report.issues),
      policyCheckedAt: new Date(),
    })
    .where(eq(posts.id, postId));

  return report;
}

/** The check itself, usable before a post exists in the database. */
export async function runPolicyCheck(
  input: Parameters<typeof checkAdsensePolicy>[0],
  opts: { useAi?: boolean; pinnedText?: number | null } = {},
): Promise<PolicyReport> {
  const base = checkAdsensePolicy(input);
  if (!opts.useAi) return base;

  const chain = await pickProviders('text');
  if (!chain.length) return base;

  try {
    const { data } = await generateJson<{
      verdict?: string;
      reasoning?: string;
      issues?: Partial<PolicyIssue>[];
    }>(
      {
        prompt: fill(POLICY_REVIEW_PROMPT, {
          title: input.title,
          category: input.category || 'Blog',
          content: truncate(input.contentMd, 9000),
        }),
        maxTokens: 2000,
        temperature: 0.2,
      },
      { pinnedId: opts.pinnedText ?? null, scope: 'policy' },
    );
    return mergeAiReview(base, data);
  } catch (err) {
    await logWarn('policy', 'Model policy review unavailable, using the local scan only', {
      error: errMessage(err),
    });
    return base;
  }
}

/**
 * Decide what a verdict means for publishing. A blocker holds the article back
 * as a draft when the operator has asked for that, rather than putting a
 * monetisation risk live and hoping someone notices.
 */
export async function applyPolicyGate(
  report: PolicyReport,
  intended: 'draft' | 'published',
): Promise<{ status: 'draft' | 'published'; heldBack: boolean }> {
  const s = await getSettings();
  if (intended !== 'published') return { status: intended, heldBack: false };
  if (!isOn(s['policy.blockPublish'])) return { status: intended, heldBack: false };

  if (report.status === 'fail') {
    await logInfo('policy', 'Article held as a draft — AdSense policy blocker', {
      issues: report.issues.filter((i) => i.severity === 'blocker').map((i) => i.title),
    });
    return { status: 'draft', heldBack: true };
  }
  return { status: intended, heldBack: false };
}
