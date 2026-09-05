import 'server-only';
import { and, asc, eq, inArray, lte, sql } from 'drizzle-orm';
import { db, campaigns, jobs, posts, keywords, indexStatus, type Campaign, type Job } from '@/db';
import { json } from '@/lib/util';
import { logInfo, logWarn, logError, errMessage } from '@/lib/log';
import { pruneLogs } from '@/lib/log';
import { resetDailyQuotas } from '@/providers';
import { generateArticle } from './generate';
import { researchKeywords, saveKeywords, takeNextKeyword, markKeywordUsed } from './keywords';
import { checkPostIndexing, autoFixPost, pingIndexNow } from './indexing';
import { addInternalLinks } from './internal-links';
import { getSettings, isOn } from '@/lib/settings';

export type TickResult = {
  published: number;
  campaignsRun: number;
  jobsProcessed: number;
  jobsFailed: number;
  messages: string[];
};

/** Serialise ticks so an inline scheduler and an external cron cannot overlap. */
const lock = globalThis as unknown as { __bf_tick?: boolean };

export async function tick(opts: { maxJobs?: number } = {}): Promise<TickResult> {
  const result: TickResult = {
    published: 0, campaignsRun: 0, jobsProcessed: 0, jobsFailed: 0, messages: [],
  };
  if (lock.__bf_tick) {
    result.messages.push('A tick is already running — skipped.');
    return result;
  }
  lock.__bf_tick = true;
  try {
    result.published = await publishDue();
    result.campaignsRun = await enqueueDueCampaigns();

    await sweepIndexing();

    const maxJobs = opts.maxJobs ?? 3;
    for (let i = 0; i < maxJobs; i++) {
      const job = await claimNextJob();
      if (!job) break;
      const ok = await runJob(job);
      ok ? result.jobsProcessed++ : result.jobsFailed++;
    }

    await housekeeping();
    return result;
  } finally {
    lock.__bf_tick = false;
  }
}

/* ------------------------------------------------------------ publishing */

async function publishDue(): Promise<number> {
  const due = await db
    .select()
    .from(posts)
    .where(and(eq(posts.status, 'scheduled'), lte(posts.scheduledFor, new Date())));
  if (!due.length) return 0;

  await db
    .update(posts)
    .set({ status: 'published', publishedAt: new Date(), updatedAt: new Date() })
    .where(inArray(posts.id, due.map((p) => p.id)));

  const s = await getSettings();
  const base = (s['site.url'] || '').replace(/\/+$/, '');
  await pingIndexNow(due.map((p) => `${base}/blog/${p.slug}`)).catch(() => false);

  await logInfo('scheduler', `Published ${due.length} scheduled post(s)`, {
    slugs: due.map((p) => p.slug),
  });
  return due.length;
}

/* ------------------------------------------------------------- campaigns */

async function enqueueDueCampaigns(): Promise<number> {
  const due = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.status, 'active'), lte(campaigns.nextRunAt, new Date())));

  let count = 0;
  for (const c of due) {
    if (c.maxArticles > 0 && c.generatedCount >= c.maxArticles) {
      await db.update(campaigns).set({ status: 'completed' }).where(eq(campaigns.id, c.id));
      await logInfo('scheduler', `Campaign "${c.name}" finished its target of ${c.maxArticles} articles`);
      continue;
    }
    for (let i = 0; i < Math.max(1, c.articlesPerRun); i++) {
      await enqueue('generate', { campaignId: c.id }, { campaignId: c.id });
    }
    await db
      .update(campaigns)
      .set({ lastRunAt: new Date(), nextRunAt: nextRun(c) })
      .where(eq(campaigns.id, c.id));
    count++;
  }
  return count;
}

export function nextRun(c: Pick<Campaign, 'intervalMinutes'>, from = Date.now()): Date {
  return new Date(from + Math.max(1, c.intervalMinutes) * 60_000);
}

/* ---------------------------------------------------- indexing autopilot */

/**
 * Queue indexing checks for the pages that have gone longest without one, and
 * ask them to repair themselves if the operator has opted into that.
 *
 * Deliberately a queue rather than direct work: each check can hit the Search
 * Console API and each fix can call a model, so they belong on the job runner
 * where they retry and stay visible, not inside a scheduler tick.
 */
async function sweepIndexing(): Promise<number> {
  const s = await getSettings();
  if (!isOn(s['indexing.autoCheck'])) return 0;

  const base = (s['site.url'] || '').replace(/\/+$/, '');
  if (!base || base.includes('localhost')) return 0; // nothing to check yet

  const intervalMs = Math.max(1, Number(s['indexing.intervalHours']) || 24) * 3_600_000;
  const batch = Math.min(50, Math.max(1, Number(s['indexing.batchSize']) || 10));
  const cutoff = new Date(Date.now() - intervalMs);
  const autoFix = isOn(s['indexing.autoFix']);

  const due = await db
    .select({ id: posts.id, lastCheckedAt: indexStatus.lastCheckedAt })
    .from(posts)
    .leftJoin(indexStatus, eq(indexStatus.postId, posts.id))
    .where(
      and(
        eq(posts.status, 'published'),
        eq(posts.noindex, false),
        // never checked, or checked longer ago than the interval
        sql`${indexStatus.lastCheckedAt} IS NULL OR ${indexStatus.lastCheckedAt} < ${cutoff}`,
      ),
    )
    .orderBy(sql`${indexStatus.lastCheckedAt} IS NOT NULL`, indexStatus.lastCheckedAt)
    .limit(batch);

  if (!due.length) return 0;

  // Skip anything already queued so a slow run cannot pile duplicates up.
  const queued = await db
    .select({ postId: jobs.postId })
    .from(jobs)
    .where(and(eq(jobs.type, 'index_check'), inArray(jobs.status, ['pending', 'running'])));
  const alreadyQueued = new Set(queued.map((q) => q.postId));

  let queuedCount = 0;
  for (const row of due) {
    if (alreadyQueued.has(row.id)) continue;
    await enqueue('index_check', { postId: row.id, autoFix }, { postId: row.id });
    queuedCount++;
  }

  if (queuedCount) {
    await logInfo('scheduler', `Queued ${queuedCount} indexing check(s)`, { autoFix });
  }
  return queuedCount;
}

/* ----------------------------------------------------------------- jobs */

export async function enqueue(
  type: Job['type'],
  payload: Record<string, unknown> = {},
  opts: { campaignId?: number | null; postId?: number | null; runAt?: Date } = {},
): Promise<Job> {
  const [job] = await db
    .insert(jobs)
    .values({
      type,
      payload: JSON.stringify(payload),
      campaignId: opts.campaignId ?? null,
      postId: opts.postId ?? null,
      runAt: opts.runAt ?? new Date(),
    })
    .returning();
  return job;
}

async function claimNextJob(): Promise<Job | null> {
  const [job] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.status, 'pending'), lte(jobs.runAt, new Date())))
    .orderBy(asc(jobs.runAt), asc(jobs.id))
    .limit(1);
  if (!job) return null;

  // Guard against two workers grabbing the same row.
  const updated = await db
    .update(jobs)
    .set({ status: 'running', startedAt: new Date(), attempts: sql`${jobs.attempts} + 1` })
    .where(and(eq(jobs.id, job.id), eq(jobs.status, 'pending')))
    .returning();
  return updated[0] ?? null;
}

export async function runJob(job: Job): Promise<boolean> {
  const payload = json<Record<string, unknown>>(job.payload, {});
  const progress = async (step: string) => {
    await db.update(jobs).set({ progress: step }).where(eq(jobs.id, job.id));
  };

  try {
    let result: unknown = {};
    switch (job.type) {
      case 'generate':
        result = await jobGenerate(payload, progress);
        break;
      case 'research':
        result = await jobResearch(payload);
        break;
      case 'index_check':
        result = await jobIndexCheck(payload);
        break;
      case 'seo_fix':
        result = await autoFixPost(Number(payload.postId));
        break;
      case 'policy_review':
        result = await jobPolicyReview(payload);
        break;
      case 'policy_fix':
        result = await jobPolicyFix(payload);
        break;
      case 'internal_links':
        result = await jobInternalLinks(payload);
        break;
      case 'publish':
        result = await jobPublish(payload);
        break;
      default:
        throw new Error(`Unknown job type: ${job.type}`);
    }

    await db
      .update(jobs)
      .set({
        status: 'done',
        finishedAt: new Date(),
        progress: 'Complete',
        result: JSON.stringify(result ?? {}).slice(0, 8000),
      })
      .where(eq(jobs.id, job.id));
    return true;
  } catch (err) {
    const message = errMessage(err);
    const willRetry = job.attempts < job.maxAttempts;
    await db
      .update(jobs)
      .set({
        status: willRetry ? 'pending' : 'failed',
        error: message.slice(0, 1000),
        finishedAt: willRetry ? null : new Date(),
        // Back off exponentially: 5min, 20min, 45min.
        runAt: willRetry ? new Date(Date.now() + job.attempts ** 2 * 5 * 60_000) : job.runAt,
        progress: willRetry ? `Retrying after error: ${message.slice(0, 120)}` : 'Failed',
      })
      .where(eq(jobs.id, job.id));
    await logError('scheduler', `Job ${job.type}#${job.id} failed${willRetry ? ' (will retry)' : ''}`, {
      error: message,
    });
    return false;
  }
}

/* ----------------------------------------------------------- job bodies */

async function jobGenerate(
  payload: Record<string, unknown>,
  progress: (s: string) => Promise<void>,
) {
  const campaignId = payload.campaignId ? Number(payload.campaignId) : null;
  const campaign = campaignId
    ? (await db.select().from(campaigns).where(eq(campaigns.id, campaignId)))[0]
    : null;

  let keyword = String(payload.keyword || '').trim();
  if (!keyword && campaign) keyword = (await nextKeywordForCampaign(campaign)) || '';
  if (!keyword) throw new Error('No keyword available — add keywords to the campaign or run research.');

  const overrides = (payload.overrides || {}) as Record<string, unknown>;
  if (payload.scheduledFor) overrides.scheduledFor = new Date(String(payload.scheduledFor));

  const post = await generateArticle({
    keyword,
    campaign,
    overrides: overrides as never,
    onProgress: progress,
  });

  await markKeywordUsed(keyword, post.id);
  if (campaign) {
    await db
      .update(campaigns)
      .set({ generatedCount: sql`${campaigns.generatedCount} + 1` })
      .where(eq(campaigns.id, campaign.id));
  }
  if (post.status === 'published') {
    const s = await getSettings();
    await pingIndexNow([`${(s['site.url'] || '').replace(/\/+$/, '')}/blog/${post.slug}`]).catch(() => false);
  }
  return { postId: post.id, title: post.title, slug: post.slug, seoScore: post.seoScore };
}

/**
 * Campaign keyword supply: explicit list first, then anything already queued,
 * then fresh research from the seeds.
 */
async function nextKeywordForCampaign(campaign: Campaign): Promise<string | null> {
  const listed = campaign.seedKeywords
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  if (campaign.keywordSource === 'list' && listed.length) {
    const used = await db
      .select({ keyword: keywords.keyword })
      .from(keywords)
      .where(and(eq(keywords.campaignId, campaign.id), eq(keywords.status, 'used')));
    const usedSet = new Set(used.map((u) => u.keyword.toLowerCase()));
    const next = listed.find((k) => !usedSet.has(k.toLowerCase()));
    if (next) {
      await db
        .insert(keywords)
        .values({
          keyword: next.toLowerCase(),
          source: 'manual',
          campaignId: campaign.id,
          status: 'queued',
          seed: next,
        })
        .onConflictDoNothing();
      return next;
    }
    await logWarn('scheduler', `Campaign "${campaign.name}" has used every keyword in its list`);
  }

  const queued = await takeNextKeyword(campaign.id);
  if (queued) return queued;

  const seed = listed[0] || campaign.name;
  const researched = await researchKeywords(seed, {
    limit: 30,
    campaignId: campaign.id,
    context: `Blog category: ${campaign.name}. Audience: ${campaign.audience}.`,
  });
  await saveKeywords(researched, { campaignId: campaign.id });
  return takeNextKeyword(campaign.id);
}

async function jobResearch(payload: Record<string, unknown>) {
  const seed = String(payload.seed || '').trim();
  if (!seed) throw new Error('Research job needs a seed keyword');
  const rows = await researchKeywords(seed, {
    limit: Number(payload.limit) || 50,
    campaignId: payload.campaignId ? Number(payload.campaignId) : null,
    context: String(payload.context || ''),
  });
  const saved = await saveKeywords(rows, {
    campaignId: payload.campaignId ? Number(payload.campaignId) : null,
  });
  return { found: rows.length, saved };
}

async function jobIndexCheck(payload: Record<string, unknown>) {
  const postId = Number(payload.postId);
  const { issues, url } = await checkPostIndexing(postId);
  const actionable = issues.filter((i) => i.severity !== 'info' && i.autoFixable);

  if (payload.autoFix && actionable.length) {
    const fix = await autoFixPost(postId);
    await logInfo('indexing', `Auto-resolved ${fix.applied.length} issue(s) on ${url}`, {
      applied: fix.applied,
      diagnosis: fix.diagnosis,
    });
    return { url, issues: issues.length, fixed: fix.applied.length, applied: fix.applied };
  }
  return { url, issues: issues.length, actionable: actionable.length };
}

async function jobPolicyFix(payload: Record<string, unknown>) {
  const postId = Number(payload.postId);
  const { fixPolicyIssues } = await import('./policy-fix');
  const result = await fixPolicyIssues(postId, { useAi: payload.useAi !== false });
  return {
    applied: result.applied,
    skipped: result.skipped,
    words: `${result.words.before} → ${result.words.after}`,
  };
}

async function jobPolicyReview(payload: Record<string, unknown>) {
  const postId = Number(payload.postId);
  const { reviewPost } = await import('./policy-runner');
  const report = await reviewPost(postId, { useAi: payload.useAi !== false });
  return {
    status: report.status,
    score: report.score,
    issues: report.issues.map((i) => `${i.severity}: ${i.title}`),
  };
}

async function jobInternalLinks(payload: Record<string, unknown>) {
  const postId = Number(payload.postId);
  const [post] = await db.select().from(posts).where(eq(posts.id, postId));
  if (!post) throw new Error('Post not found');
  const linked = await addInternalLinks(post.contentMd, {
    postId: post.id,
    title: post.title,
    focusKeyword: post.focusKeyword,
    max: Number(payload.max) || 5,
    useAi: payload.useAi !== false,
  });
  if (linked.links.length) {
    const { renderMarkdown } = await import('@/lib/markdown');
    await db
      .update(posts)
      .set({
        contentMd: linked.markdown,
        contentHtml: renderMarkdown(linked.markdown).html,
        updatedAt: new Date(),
      })
      .where(eq(posts.id, postId));
  }
  return { added: linked.links.length };
}

async function jobPublish(payload: Record<string, unknown>) {
  const postId = Number(payload.postId);
  await db
    .update(posts)
    .set({ status: 'published', publishedAt: new Date(), updatedAt: new Date() })
    .where(eq(posts.id, postId));
  return { postId };
}

/* ---------------------------------------------------------- housekeeping */

const house = globalThis as unknown as { __bf_house?: number };

async function housekeeping() {
  const last = house.__bf_house || 0;
  if (Date.now() - last < 6 * 3600_000) return;
  house.__bf_house = Date.now();
  await resetDailyQuotas().catch(() => {});
  await pruneLogs(30).catch(() => {});
  // Retire jobs that finished long ago so the table stays small.
  await db
    .delete(jobs)
    .where(and(inArray(jobs.status, ['done', 'cancelled']), lte(jobs.finishedAt, new Date(Date.now() - 14 * 86_400_000))))
    .catch(() => {});
}

/* ------------------------------------------------------ inline scheduler */

const INLINE_KEY = Symbol.for('blogforge.inlineScheduler');
type InlineHost = { [INLINE_KEY]?: NodeJS.Timeout };

/**
 * Runs the tick loop inside the Next.js process. Fine for a VPS, Docker or
 * local dev; on serverless use the /api/cron/tick endpoint with Vercel Cron or
 * any free cron service instead.
 *
 * Dev recompiles re-evaluate this module, so the handle lives on a global
 * Symbol.for key and any previous timer is cleared — otherwise every hot reload
 * would leave another interval running and ticks would multiply.
 */
export function startInlineScheduler(intervalMs = 60_000) {
  const host = globalThis as unknown as InlineHost;
  const existing = host[INLINE_KEY];
  if (existing) clearInterval(existing);

  host[INLINE_KEY] = setInterval(() => {
    tick({ maxJobs: 2 }).catch((err) => console.error('[blogforge] tick failed', err));
  }, intervalMs);

  if (!existing) {
    console.log(`[blogforge] inline scheduler started (every ${Math.round(intervalMs / 1000)}s)`);
  }
}
