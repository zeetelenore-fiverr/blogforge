import 'server-only';
import { and, desc, eq, ne, sql } from 'drizzle-orm';
import { db, posts, indexStatus, internalLinks, providers, type Post } from '@/db';
import { decrypt } from '@/lib/crypto';
import { getSettings, isOn } from '@/lib/settings';
import { json, truncate, stripMarkdown } from '@/lib/util';
import { logInfo, logWarn, errMessage } from '@/lib/log';
import { generateJson } from '@/providers';
import { googleAccessToken, inspectUrl, indexNowSubmit, type InspectionResult } from '@/providers/seo';
import { analyzeSeo, type SeoCheck } from './seo-analyzer';
import { fill, SEO_FIX_PROMPT } from './prompts';
import { refreshPostDerived } from './generate';
import { addInternalLinks } from './internal-links';

export type IndexIssue = {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  detail: string;
  /** Whether the auto-fixer can act on this without a human. */
  autoFixable: boolean;
};

const GSC_SCOPE = 'https://www.googleapis.com/auth/webmasters';

/* ---------------------------------------------------------------- auth */

export async function gscCredentials(): Promise<{ clientEmail: string; privateKey: string; siteUrl: string } | null> {
  const s = await getSettings();
  if (s['gsc.clientEmail'] && s['gsc.privateKey'] && s['gsc.siteUrl']) {
    return {
      clientEmail: s['gsc.clientEmail'],
      privateKey: s['gsc.privateKey'],
      siteUrl: s['gsc.siteUrl'],
    };
  }
  // Or a provider row of kind 'seo' with adapter gsc.
  const [row] = await db
    .select()
    .from(providers)
    .where(and(eq(providers.kind, 'seo'), eq(providers.providerId, 'gsc'), eq(providers.enabled, true)));
  if (!row) return null;
  const extra = json<Record<string, string>>(row.extra, {});
  if (!extra.clientEmail || !extra.siteUrl) return null;
  return { clientEmail: extra.clientEmail, privateKey: decrypt(row.apiKey), siteUrl: extra.siteUrl };
}

export async function gscToken(): Promise<{ token: string; siteUrl: string } | null> {
  const creds = await gscCredentials();
  if (!creds) return null;
  const token = await googleAccessToken(creds.clientEmail, creds.privateKey, GSC_SCOPE);
  return { token, siteUrl: creds.siteUrl };
}

/* -------------------------------------------------------------- checks */

/**
 * Inspect one post. Uses Search Console when it is connected; always runs the
 * local checks, because most "not indexed" problems are visible without Google
 * telling you (noindex left on, thin content, orphan page, no sitemap entry).
 */
export async function checkPostIndexing(postId: number): Promise<{
  url: string;
  issues: IndexIssue[];
  inspection: InspectionResult | null;
}> {
  const [post] = await db.select().from(posts).where(eq(posts.id, postId));
  if (!post) throw new Error('Post not found');
  const s = await getSettings();
  const url = `${(s['site.url'] || '').replace(/\/+$/, '')}/blog/${post.slug}`;

  const issues = await localIssues(post, s);
  let inspection: InspectionResult | null = null;

  try {
    const auth = await gscToken();
    if (auth) {
      inspection = await inspectUrl(auth.token, auth.siteUrl, url);
      issues.push(...interpretInspection(inspection));
    }
  } catch (err) {
    await logWarn('indexing', `Search Console inspection failed for ${url}`, {
      error: errMessage(err),
    });
    issues.push({
      id: 'gsc-unavailable',
      severity: 'info',
      title: 'Search Console check unavailable',
      detail: errMessage(err),
      autoFixable: false,
    });
  }

  await db
    .insert(indexStatus)
    .values({
      postId: post.id,
      url,
      coverageState: inspection?.coverageState || (issues.some((i) => i.severity === 'critical') ? 'Blocked locally' : 'Not checked'),
      verdict: inspection?.verdict || 'unknown',
      robotsTxtState: inspection?.robotsTxtState || '',
      indexingState: inspection?.indexingState || '',
      lastCrawlTime: inspection?.lastCrawlTime || null,
      issues: JSON.stringify(issues),
      lastCheckedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: indexStatus.url,
      set: {
        postId: post.id,
        coverageState: inspection?.coverageState || sql`${indexStatus.coverageState}`,
        verdict: inspection?.verdict || sql`${indexStatus.verdict}`,
        robotsTxtState: inspection?.robotsTxtState || '',
        indexingState: inspection?.indexingState || '',
        lastCrawlTime: inspection?.lastCrawlTime || null,
        issues: JSON.stringify(issues),
        lastCheckedAt: new Date(),
      },
    });

  return { url, issues, inspection };
}

async function localIssues(post: Post, s: Record<string, string>): Promise<IndexIssue[]> {
  const issues: IndexIssue[] = [];

  if (post.status !== 'published') {
    issues.push({
      id: 'not-published',
      severity: 'critical',
      title: 'Post is not published',
      detail: `Status is "${post.status}" — the URL returns 404 to Googlebot.`,
      autoFixable: false,
    });
  }
  if (post.noindex) {
    issues.push({
      id: 'noindex',
      severity: 'critical',
      title: 'noindex is set on this post',
      detail: 'The robots meta tag tells Google not to index this page.',
      autoFixable: true,
    });
  }
  if (isOn(s['seo.noindexSite'])) {
    issues.push({
      id: 'site-noindex',
      severity: 'critical',
      title: 'The whole site is set to noindex',
      detail: 'Settings → SEO has "Discourage search engines" enabled.',
      autoFixable: true,
    });
  }
  if (!s['site.url'] || s['site.url'].includes('localhost')) {
    issues.push({
      id: 'localhost',
      severity: 'critical',
      title: 'Site URL is not a public domain',
      detail: 'Canonical URLs and the sitemap point at localhost, so nothing can be indexed.',
      autoFixable: false,
    });
  }

  const report = analyzeSeo({
    title: post.title,
    slug: post.slug,
    metaTitle: post.metaTitle,
    metaDescription: post.metaDescription,
    excerpt: post.excerpt,
    contentMd: post.contentMd,
    focusKeyword: post.focusKeyword,
    secondaryKeywords: json<string[]>(post.secondaryKeywords, []),
    featuredImage: post.featuredImage,
    featuredImageAlt: post.featuredImageAlt,
    schemaJson: post.schemaJson,
    noindex: post.noindex,
  });

  if (report.stats.words < 600) {
    issues.push({
      id: 'thin-content',
      severity: 'warning',
      title: 'Thin content',
      detail: `${report.stats.words} words. Pages under ~600 words are frequently classified as "Crawled – currently not indexed".`,
      autoFixable: true,
    });
  }

  const [{ inbound }] = await db
    .select({ inbound: sql<number>`COUNT(*)::int` })
    .from(internalLinks)
    .where(eq(internalLinks.targetPostId, post.id));
  if (Number(inbound) === 0) {
    issues.push({
      id: 'orphan',
      severity: 'warning',
      title: 'Orphan page',
      detail: 'No other page on the site links to this one, so crawlers have no path to it beyond the sitemap.',
      autoFixable: true,
    });
  }

  const [dupTitle] = await db
    .select({ id: posts.id, title: posts.title })
    .from(posts)
    .where(and(eq(posts.metaTitle, post.metaTitle), ne(posts.id, post.id), ne(posts.metaTitle, '')))
    .limit(1);
  if (dupTitle) {
    issues.push({
      id: 'duplicate-title',
      severity: 'warning',
      title: 'Duplicate meta title',
      detail: `Shares its meta title with "${dupTitle.title}". Duplicates invite "Alternate page with proper canonical tag".`,
      autoFixable: true,
    });
  }

  if (!post.schemaJson) {
    issues.push({
      id: 'no-schema',
      severity: 'info',
      title: 'No structured data',
      detail: 'Article schema is missing, so this page cannot earn rich results.',
      autoFixable: true,
    });
  }

  for (const c of report.checks.filter((c) => c.status === 'fail' && c.fix)) {
    issues.push({
      id: `seo-${c.id}`,
      severity: 'info',
      title: c.label,
      detail: c.fix || c.message,
      autoFixable: true,
    });
  }

  return issues;
}

function interpretInspection(r: InspectionResult): IndexIssue[] {
  const issues: IndexIssue[] = [];
  const coverage = r.coverageState.toLowerCase();

  if (r.verdict === 'PASS') return issues;

  if (r.robotsTxtState === 'DISALLOWED') {
    issues.push({
      id: 'robots-disallowed',
      severity: 'critical',
      title: 'Blocked by robots.txt',
      detail: 'Googlebot is disallowed from fetching this URL.',
      autoFixable: true,
    });
  }
  if (r.indexingState === 'BLOCKED_BY_META_TAG' || r.indexingState === 'BLOCKED_BY_HTTP_HEADER') {
    issues.push({
      id: 'blocked-noindex',
      severity: 'critical',
      title: 'Blocked by a noindex directive',
      detail: `Search Console reports ${r.indexingState}.`,
      autoFixable: true,
    });
  }
  if (coverage.includes('discovered')) {
    issues.push({
      id: 'discovered-not-indexed',
      severity: 'warning',
      title: 'Discovered — currently not indexed',
      detail:
        'Google knows the URL but has not crawled it. Usually a crawl-budget or perceived-value signal: strengthen internal links and publish consistently.',
      autoFixable: true,
    });
  }
  if (coverage.includes('crawled')) {
    issues.push({
      id: 'crawled-not-indexed',
      severity: 'warning',
      title: 'Crawled — currently not indexed',
      detail:
        'Google fetched the page and chose not to index it. Almost always a content-quality or duplication judgement: add unique depth, tighten the intent match, and improve internal linking.',
      autoFixable: true,
    });
  }
  if (coverage.includes('duplicate') || coverage.includes('alternate')) {
    issues.push({
      id: 'duplicate',
      severity: 'warning',
      title: 'Treated as a duplicate',
      detail: `Search Console reports "${r.coverageState}". Differentiate the content or set the canonical deliberately.`,
      autoFixable: true,
    });
  }
  if (r.pageFetchState && r.pageFetchState !== 'SUCCESSFUL') {
    issues.push({
      id: 'fetch-failed',
      severity: 'critical',
      title: 'Google could not fetch the page',
      detail: `Fetch state: ${r.pageFetchState}.`,
      autoFixable: false,
    });
  }
  if (r.mobileVerdict && r.mobileVerdict !== 'PASS') {
    issues.push({
      id: 'mobile',
      severity: 'warning',
      title: 'Mobile usability problem',
      detail: `Mobile verdict: ${r.mobileVerdict}.`,
      autoFixable: false,
    });
  }
  return issues;
}

/* ------------------------------------------------------------- auto-fix */

export type FixResult = { applied: string[]; diagnosis: string; skipped: string[] };

/**
 * Repair what can be repaired automatically, then ask the model to close the
 * content gaps behind a "crawled – currently not indexed" verdict.
 */
export async function autoFixPost(postId: number, opts: { useAi?: boolean } = {}): Promise<FixResult> {
  const [post] = await db.select().from(posts).where(eq(posts.id, postId));
  if (!post) throw new Error('Post not found');

  const s = await getSettings();
  const url = `${(s['site.url'] || '').replace(/\/+$/, '')}/blog/${post.slug}`;
  const [statusRow] = await db.select().from(indexStatus).where(eq(indexStatus.url, url));
  const issues = json<IndexIssue[]>(statusRow?.issues || '[]', []);
  const applied: string[] = [];
  const skipped: string[] = [];

  /* -- deterministic fixes first: cheap, safe, no model required -------- */
  if (post.noindex) {
    await db.update(posts).set({ noindex: false }).where(eq(posts.id, postId));
    applied.push('Removed the noindex flag from this post');
  }
  if (post.status === 'draft' && issues.some((i) => i.id === 'not-published')) {
    skipped.push('Post is still a draft — publish it manually when you are happy with it');
  }
  if (issues.some((i) => i.id === 'orphan')) {
    const linked = await addInternalLinks(post.contentMd, {
      postId: post.id,
      title: post.title,
      focusKeyword: post.focusKeyword,
      max: 4,
      useAi: opts.useAi !== false,
    });
    if (linked.links.length) {
      await db.update(posts).set({ contentMd: linked.markdown }).where(eq(posts.id, postId));
      applied.push(`Added ${linked.links.length} internal link(s) out of this page`);
    }
    const { linkBackToNewPost } = await import('./internal-links');
    const back = await linkBackToNewPost(post, 3).catch(() => 0);
    if (back) applied.push(`Added ${back} inbound link(s) from existing articles`);
  }

  /* -- AI content fix -------------------------------------------------- */
  const report = analyzeSeo({
    title: post.title, slug: post.slug, metaTitle: post.metaTitle,
    metaDescription: post.metaDescription, excerpt: post.excerpt,
    contentMd: post.contentMd, focusKeyword: post.focusKeyword,
    secondaryKeywords: json<string[]>(post.secondaryKeywords, []),
    featuredImage: post.featuredImage, featuredImageAlt: post.featuredImageAlt,
    schemaJson: post.schemaJson, noindex: post.noindex,
  });
  const failed: SeoCheck[] = report.checks.filter((c) => c.status !== 'pass');

  if (opts.useAi !== false && (failed.length || issues.length)) {
    try {
      const { data } = await generateJson<{
        diagnosis?: string;
        metaTitle?: string;
        metaDescription?: string;
        excerpt?: string;
        addSections?: { afterHeading?: string; markdown: string }[];
        rewriteIntro?: string;
        additionalKeywords?: string[];
        actions?: string[];
      }>(
        {
          prompt: fill(SEO_FIX_PROMPT, {
            siteName: s['site.name'],
            url,
            keyword: post.focusKeyword,
            title: post.title,
            metaTitle: post.metaTitle,
            metaDescription: post.metaDescription,
            wordCount: post.wordCount,
            gscStatus: issues.length
              ? issues.map((i) => `- [${i.severity}] ${i.title}: ${i.detail}`).join('\n')
              : 'No Search Console data available.',
            failedChecks: failed.map((c) => `- ${c.label}: ${c.message}${c.fix ? ` → ${c.fix}` : ''}`).join('\n'),
            content: truncate(post.contentMd, 9000),
          }),
          maxTokens: 6000,
          temperature: 0.5,
        },
        { scope: 'seo-fix' },
      );

      let md = (await db.select().from(posts).where(eq(posts.id, postId)))[0].contentMd;
      const updates: Partial<typeof posts.$inferInsert> = {};

      if (data.metaTitle && data.metaTitle !== post.metaTitle && data.metaTitle.length <= 65) {
        updates.metaTitle = data.metaTitle;
        applied.push('Rewrote the meta title');
      }
      if (data.metaDescription && data.metaDescription !== post.metaDescription) {
        updates.metaDescription = truncate(data.metaDescription, 158);
        applied.push('Rewrote the meta description');
      }
      if (data.excerpt && data.excerpt.length > 40) {
        updates.excerpt = data.excerpt;
        applied.push('Rewrote the excerpt');
      }
      if (data.rewriteIntro && data.rewriteIntro.length > 80) {
        md = replaceIntro(md, data.rewriteIntro);
        applied.push('Rewrote the opening paragraph');
      }
      for (const section of data.addSections || []) {
        if (!section?.markdown || section.markdown.length < 120) continue;
        md = insertSection(md, section.afterHeading || '', section.markdown);
        applied.push(`Added section: ${firstHeading(section.markdown)}`);
      }
      if (Object.keys(updates).length || md !== post.contentMd) {
        await db.update(posts).set({ ...updates, contentMd: md, updatedAt: new Date() }).where(eq(posts.id, postId));
      }
      for (const a of data.actions || []) if (!applied.includes(a)) applied.push(a);

      await refreshPostDerived(postId);
      const diagnosis = data.diagnosis || '';

      await recordFix(url, applied);
      await pingIndexNow([url]);
      await logInfo('seo-fix', `Auto-fixed "${post.title}"`, { applied, url });
      return { applied, diagnosis, skipped };
    } catch (err) {
      await logWarn('seo-fix', 'AI fix step failed', { error: errMessage(err) });
      skipped.push(`AI fix unavailable: ${errMessage(err)}`);
    }
  }

  await refreshPostDerived(postId);
  await recordFix(url, applied);
  if (applied.length) await pingIndexNow([url]);
  return { applied, diagnosis: '', skipped };
}

async function recordFix(url: string, applied: string[]) {
  if (!applied.length) return;
  await db
    .update(indexStatus)
    .set({ autoFixed: true, fixesApplied: JSON.stringify(applied) })
    .where(eq(indexStatus.url, url));
}

/* ------------------------------------------------------------ IndexNow */

/**
 * IndexNow key is derived from APP_SECRET so it is stable across restarts and
 * matches the file served at /<key>.txt.
 */
export async function indexNowKey(): Promise<string> {
  const crypto = await import('node:crypto');
  const secret = process.env.APP_SECRET || 'blogforge';
  return crypto.createHash('sha256').update(`indexnow:${secret}`).digest('hex').slice(0, 32);
}

export async function pingIndexNow(urls: string[]): Promise<boolean> {
  try {
    const s = await getSettings();
    const base = s['site.url'] || '';
    if (!base || base.includes('localhost')) return false;
    const host = new URL(base).host;
    const key = await indexNowKey();
    const res = await indexNowSubmit(host, key, urls);
    await logInfo('indexing', `IndexNow submission: ${res.status}`, { urls: urls.length });
    return res.ok;
  } catch (err) {
    await logWarn('indexing', 'IndexNow submission failed', { error: errMessage(err) });
    return false;
  }
}

/* -------------------------------------------------------------- helpers */

function replaceIntro(md: string, intro: string): string {
  const lines = md.split('\n');
  const firstBodyLine = lines.findIndex((l) => l.trim() && !l.startsWith('#') && !l.startsWith('-'));
  if (firstBodyLine === -1) return `${intro}\n\n${md}`;
  let end = firstBodyLine;
  while (end < lines.length && lines[end].trim()) end++;
  return [...lines.slice(0, firstBodyLine), intro, ...lines.slice(end)].join('\n');
}

function insertSection(md: string, afterHeading: string, section: string): string {
  if (!afterHeading) return `${md.trimEnd()}\n\n${section.trim()}\n`;
  const lines = md.split('\n');
  const idx = lines.findIndex(
    (l) => /^#{2,3}\s/.test(l) && l.toLowerCase().includes(afterHeading.toLowerCase().slice(0, 30)),
  );
  if (idx === -1) return `${md.trimEnd()}\n\n${section.trim()}\n`;
  let next = idx + 1;
  while (next < lines.length && !/^#{2}\s/.test(lines[next])) next++;
  return [...lines.slice(0, next), '', section.trim(), '', ...lines.slice(next)].join('\n');
}

function firstHeading(md: string): string {
  const m = md.match(/^#{2,3}\s+(.+)$/m);
  return m ? m[1].trim() : 'new section';
}

/** Posts most in need of an indexing check, oldest check first. */
export async function postsNeedingIndexCheck(limit = 20) {
  return db
    .select({
      id: posts.id,
      title: posts.title,
      slug: posts.slug,
      publishedAt: posts.publishedAt,
      lastCheckedAt: indexStatus.lastCheckedAt,
      coverageState: indexStatus.coverageState,
      verdict: indexStatus.verdict,
    })
    .from(posts)
    .leftJoin(indexStatus, eq(indexStatus.postId, posts.id))
    .where(eq(posts.status, 'published'))
    .orderBy(sql`${indexStatus.lastCheckedAt} IS NOT NULL`, indexStatus.lastCheckedAt, desc(posts.publishedAt))
    .limit(limit);
}
