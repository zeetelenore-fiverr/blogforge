import Link from 'next/link';
import { and, desc, eq, gte, ne, sql } from 'drizzle-orm';
import { db, posts, categories, campaigns, jobs, keywords, providers, indexStatus, internalLinks } from '@/db';
import { requireUser } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { json, formatDate } from '@/lib/util';
import { PageHeader } from '@/components/admin/bits';
import {
  StatTile, AreaChart, BarChart, StackedBar, RankedBars, Meter, ChartCard,
  CATEGORICAL, ORDINAL, STATUS, type TimePoint,
} from '@/components/admin/charts';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ days?: string }> };

const RANGES = [
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 365, label: '12 months' },
];

export default async function ReportsPage({ searchParams }: Props) {
  await requireUser();
  const sp = await searchParams;
  const days = RANGES.some((r) => r.days === Number(sp.days)) ? Number(sp.days) : 30;
  const since = Date.now() - days * 86_400_000;

  const s = await getSettings();

  const [
    [totals],
    [scoreBands],
    published,
    catRows,
    campaignRows,
    [linkStats],
    indexRows,
    [policyCounts],
    [jobStats],
    providerRows,
    [keywordStats],
  ] = await Promise.all([
    db
      .select({
        total: sql<number>`COUNT(*)::int`,
        published: sql<number>`COALESCE(SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END), 0)::int`,
        draft: sql<number>`COALESCE(SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END), 0)::int`,
        scheduled: sql<number>`COALESCE(SUM(CASE WHEN status = 'scheduled' THEN 1 ELSE 0 END), 0)::int`,
        words: sql<number>`COALESCE(SUM(word_count), 0)::int`,
        avgScore: sql<number>`COALESCE(AVG(CASE WHEN status = 'published' THEN seo_score END), 0)::float`,
        withImage: sql<number>`COALESCE(SUM(CASE WHEN featured_image IS NOT NULL THEN 1 ELSE 0 END), 0)::int`,
      })
      .from(posts),
    db
      .select({
        a: sql<number>`COALESCE(SUM(CASE WHEN seo_score >= 90 THEN 1 ELSE 0 END), 0)::int`,
        b: sql<number>`COALESCE(SUM(CASE WHEN seo_score >= 80 AND seo_score < 90 THEN 1 ELSE 0 END), 0)::int`,
        c: sql<number>`COALESCE(SUM(CASE WHEN seo_score >= 70 AND seo_score < 80 THEN 1 ELSE 0 END), 0)::int`,
        d: sql<number>`COALESCE(SUM(CASE WHEN seo_score >= 55 AND seo_score < 70 THEN 1 ELSE 0 END), 0)::int`,
        f: sql<number>`COALESCE(SUM(CASE WHEN seo_score < 55 THEN 1 ELSE 0 END), 0)::int`,
      })
      .from(posts)
      .where(ne(posts.status, 'failed')),
    db
      .select({ publishedAt: posts.publishedAt, seoScore: posts.seoScore, wordCount: posts.wordCount })
      .from(posts)
      .where(and(eq(posts.status, 'published'), gte(posts.publishedAt, new Date(since))))
      .orderBy(posts.publishedAt),
    // Grouped join rather than a correlated subquery: one pass, and the
    // aggregate aliases come back as plain numbers.
    db
      .select({
        name: categories.name,
        slug: categories.slug,
        n: sql<number>`COUNT(${posts.id})::int`,
        avg: sql<number>`COALESCE(AVG(${posts.seoScore}), 0)::float`,
      })
      .from(categories)
      .leftJoin(posts, and(eq(posts.categoryId, categories.id), eq(posts.status, 'published')))
      .groupBy(categories.id, categories.name, categories.slug),
    db
      .select({
        id: campaigns.id,
        name: campaigns.name,
        status: campaigns.status,
        generated: campaigns.generatedCount,
        interval: campaigns.intervalMinutes,
        nextRunAt: campaigns.nextRunAt,
      })
      .from(campaigns)
      .orderBy(desc(campaigns.generatedCount)),
    db.select({ n: sql<number>`COUNT(*)::int` }).from(internalLinks),
    db
      .select({ verdict: indexStatus.verdict, coverage: indexStatus.coverageState, issues: indexStatus.issues })
      .from(indexStatus),
    db
      .select({
        pass: sql<number>`COALESCE(SUM(CASE WHEN policy_status = 'pass' THEN 1 ELSE 0 END), 0)::int`,
        review: sql<number>`COALESCE(SUM(CASE WHEN policy_status = 'review' THEN 1 ELSE 0 END), 0)::int`,
        fail: sql<number>`COALESCE(SUM(CASE WHEN policy_status = 'fail' THEN 1 ELSE 0 END), 0)::int`,
        unchecked: sql<number>`COALESCE(SUM(CASE WHEN policy_status = 'unchecked' THEN 1 ELSE 0 END), 0)::int`,
      })
      .from(posts),
    db
      .select({
        done: sql<number>`COALESCE(SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END), 0)::int`,
        failed: sql<number>`COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0)::int`,
        pending: sql<number>`COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0)::int`,
      })
      .from(jobs),
    db
      .select({ label: providers.label, kind: providers.kind, calls: providers.totalCalls, status: providers.status })
      .from(providers)
      .where(eq(providers.enabled, true))
      .orderBy(desc(providers.totalCalls)),
    db
      .select({
        total: sql<number>`COUNT(*)::int`,
        used: sql<number>`COALESCE(SUM(CASE WHEN status = 'used' THEN 1 ELSE 0 END), 0)::int`,
        available: sql<number>`COALESCE(SUM(CASE WHEN status IN ('new','queued') THEN 1 ELSE 0 END), 0)::int`,
      })
      .from(keywords),
  ]);

  /* ------------------------------------------------- publishing over time */
  const buckets = days <= 90 ? days : 52;
  const bucketMs = (days * 86_400_000) / buckets;
  const series: TimePoint[] = Array.from({ length: buckets }, (_, i) => {
    const start = since + i * bucketMs;
    const count = published.filter((p) => {
      const t = p.publishedAt ? new Date(p.publishedAt).getTime() : 0;
      return t >= start && t < start + bucketMs;
    }).length;
    return { label: bucketLabel(start, days), value: count };
  });

  /* ------------------------------------------------------------- derived */
  const optimised = Number(scoreBands.a) + Number(scoreBands.b);
  const analysed = ['a', 'b', 'c', 'd', 'f'].reduce(
    (n, k) => n + Number((scoreBands as Record<string, unknown>)[k] || 0),
    0,
  );
  const indexed = indexRows.filter((r) => r.verdict === 'PASS').length;
  const notIndexed = indexRows.filter((r) => r.verdict !== 'PASS' && r.verdict !== 'unknown').length;
  const withIssues = indexRows.filter((r) => json<unknown[]>(r.issues, []).length > 0).length;
  const unchecked = Math.max(0, Number(totals.published) - indexRows.length);

  const last7 = series.slice(-7).reduce((n, p) => n + p.value, 0);
  const prev7 = series.slice(-14, -7).reduce((n, p) => n + p.value, 0);
  const base = (s['site.url'] || '').replace(/\/+$/, '');

  return (
    <div>
      <PageHeader
        title="Reports"
        description={`Publishing, SEO quality, indexing coverage and AdSense readiness across ${Number(totals.total)} article${Number(totals.total) === 1 ? '' : 's'}.`}
      >
        <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1">
          {RANGES.map((r) => (
            <Link
              key={r.days}
              href={`/admin/reports?days=${r.days}`}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                days === r.days ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {r.label}
            </Link>
          ))}
        </div>
      </PageHeader>

      {/* ------------------------------------------------------- KPI row */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Published"
          value={Number(totals.published) || 0}
          hint={`${last7} in the last 7 days${prev7 ? ` · ${delta(last7, prev7)} vs previous 7` : ''}`}
          spark={series.slice(-14).map((p) => p.value)}
        />
        <StatTile
          label="SEO optimised"
          value={optimised}
          suffix={`of ${analysed}`}
          hint="Articles scoring 80 or above"
          tone={optimised / Math.max(1, analysed) >= 0.6 ? 'good' : 'warning'}
        />
        <StatTile
          label="Average SEO score"
          value={Math.round(Number(totals.avgScore) || 0)}
          suffix="/100"
          hint="Published articles only"
        />
        <StatTile
          label="Words published"
          value={Number(totals.words) || 0}
          hint={`≈ ${Math.round(Number(totals.words) / Math.max(1, Number(totals.total))).toLocaleString()} per article`}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* ------------------------------------------------ publishing */}
        <div className="lg:col-span-2">
          <ChartCard
            title="Publishing cadence"
            description={`Articles published per ${days <= 90 ? 'day' : 'week'} over the last ${days <= 90 ? `${days} days` : '12 months'}. Consistency matters more to Google than volume.`}
          >
            <AreaChart data={series} unit="article" />
          </ChartCard>
        </div>

        {/* ----------------------------------------------- SEO quality */}
        <ChartCard
          title="SEO score distribution"
          description="Every article graded against the 30+ on-page checks. Anything below 70 is worth opening."
          action={
            <Link href="/admin/seo" className="btn btn-ghost btn-sm">
              Open checker
            </Link>
          }
        >
          <BarChart
            data={[
              { label: '<55', value: Number(scoreBands.f) || 0, note: 'F' },
              { label: '55–69', value: Number(scoreBands.d) || 0, note: 'D' },
              { label: '70–79', value: Number(scoreBands.c) || 0, note: 'C' },
              { label: '80–89', value: Number(scoreBands.b) || 0, note: 'B' },
              { label: '90+', value: Number(scoreBands.a) || 0, note: 'A' },
            ]}
            colors={ORDINAL}
          />
        </ChartCard>

        {/* --------------------------------------------- content pipeline */}
        <ChartCard
          title="Content pipeline"
          description="Where everything currently sits."
          action={
            <Link href="/admin/posts" className="btn btn-ghost btn-sm">
              All posts
            </Link>
          }
        >
          <StackedBar
            segments={[
              { label: 'Published', value: Number(totals.published) || 0, color: CATEGORICAL[0] },
              { label: 'Scheduled', value: Number(totals.scheduled) || 0, color: CATEGORICAL[1] },
              { label: 'Drafts', value: Number(totals.draft) || 0, color: CATEGORICAL[2] },
            ]}
          />
          <div className="mt-6 space-y-3">
            <Meter
              value={Number(totals.withImage) || 0}
              max={Number(totals.total) || 1}
              label="Articles with a featured image"
            />
            <Meter
              value={Number(keywordStats.used) || 0}
              max={Number(keywordStats.total) || 1}
              label="Keywords written up"
              tone={CATEGORICAL[2]}
            />
          </div>
        </ChartCard>

        {/* ---------------------------------------------------- indexing */}
        <ChartCard
          title="Google indexing coverage"
          description={
            base && !base.includes('localhost')
              ? 'Verdicts from Search Console, plus local checks on every published URL.'
              : 'Set a public site URL to start checking. Local checks still run.'
          }
          action={
            <Link href="/admin/indexing" className="btn btn-ghost btn-sm">
              Indexing
            </Link>
          }
        >
          <StackedBar
            segments={[
              { label: 'Indexed', value: indexed, color: STATUS.good },
              { label: 'Not indexed', value: notIndexed, color: STATUS.critical },
              { label: 'Never checked', value: unchecked, color: STATUS.neutral },
            ]}
          />
          <p className="mt-4 text-xs text-slate-500">
            {withIssues > 0 ? (
              <>
                <span className="font-semibold text-slate-800">{withIssues}</span> page
                {withIssues === 1 ? ' has' : 's have'} open issues.{' '}
                {isAutoFixOn(s) ? 'Auto-fix is on — these are repaired on the next scheduler run.' : 'Auto-fix is off; turn it on in Settings → Indexing.'}
              </>
            ) : (
              'No open indexing issues.'
            )}
          </p>
        </ChartCard>

        {/* ------------------------------------------------ AdSense policy */}
        <ChartCard
          title="AdSense policy readiness"
          description="Every article screened against Google's programme policies as it is written."
          action={
            <Link href="/admin/policy" className="btn btn-ghost btn-sm">
              Policy report
            </Link>
          }
        >
          <StackedBar
            segments={[
              { label: 'Clear', value: Number(policyCounts.pass) || 0, color: STATUS.good },
              { label: 'Needs review', value: Number(policyCounts.review) || 0, color: STATUS.warning },
              { label: 'Policy risk', value: Number(policyCounts.fail) || 0, color: STATUS.critical },
              { label: 'Not checked', value: Number(policyCounts.unchecked) || 0, color: STATUS.neutral },
            ]}
          />
          <p className="mt-4 text-xs text-slate-500">
            AdSense approval also depends on site-level factors — the About, Contact and Privacy pages,
            and a domain verified in Search Console. This screens the writing, not the whole application.
          </p>
        </ChartCard>

        {/* ------------------------------------------------- by category */}
        <ChartCard title="Articles by topic" description="Depth beats breadth — a few well-covered topics rank better than many thin ones.">
          <RankedBars
            data={catRows
              .filter((c) => Number(c.n) > 0)
              .sort((a, b) => Number(b.n) - Number(a.n))
              .map((c) => ({
                label: c.name,
                value: Number(c.n),
                note: `avg ${Math.round(Number(c.avg))}`,
              }))}
          />
        </ChartCard>

        {/* --------------------------------------------------- campaigns */}
        <ChartCard
          title="Campaign output"
          description="Articles produced by each campaign."
          action={
            <Link href="/admin/campaigns" className="btn btn-ghost btn-sm">
              Campaigns
            </Link>
          }
        >
          {campaignRows.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-500">
              No campaigns yet.{' '}
              <Link href="/admin/campaigns/new" className="font-medium text-blue-600 hover:underline">
                Create one
              </Link>
              .
            </p>
          ) : (
            <RankedBars
              data={campaignRows.map((c) => ({
                label: c.name,
                value: Number(c.generated),
                note: c.status === 'active' ? 'active' : c.status,
              }))}
              color={CATEGORICAL[1]}
            />
          )}
        </ChartCard>

        {/* --------------------------------------------- engine health */}
        <div className="lg:col-span-2">
          <ChartCard
            title="Engine health"
            description="Provider usage and job outcomes since install."
            action={
              <Link href="/admin/activity" className="btn btn-ghost btn-sm">
                Activity log
              </Link>
            }
          >
            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Provider calls
                </p>
                {providerRows.filter((p) => p.calls > 0).length === 0 ? (
                  <p className="text-xs text-slate-500">No provider calls recorded yet.</p>
                ) : (
                  <RankedBars
                    data={providerRows
                      .filter((p) => p.calls > 0)
                      .slice(0, 6)
                      .map((p) => ({
                        label: p.label,
                        value: p.calls,
                        note: p.status === 'ok' ? '' : p.status.replace('_', ' '),
                      }))}
                    color={CATEGORICAL[2]}
                  />
                )}
              </div>
              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Jobs
                </p>
                <StackedBar
                  segments={[
                    { label: 'Completed', value: Number(jobStats.done) || 0, color: STATUS.good },
                    { label: 'Pending', value: Number(jobStats.pending) || 0, color: STATUS.neutral },
                    { label: 'Failed', value: Number(jobStats.failed) || 0, color: STATUS.critical },
                  ]}
                />
                <div className="mt-5 space-y-3">
                  <Meter
                    value={Number(linkStats.n) || 0}
                    max={Math.max(Number(totals.published) * 3, 1)}
                    label="Internal links (target: 3 per article)"
                    tone={CATEGORICAL[0]}
                  />
                </div>
              </div>
            </div>
          </ChartCard>
        </div>
      </div>

      {/* ------------------------------------------------------ data table */}
      <details className="card mt-6 p-5">
        <summary className="cursor-pointer text-sm font-semibold text-slate-900">
          View the numbers as a table
        </summary>
        <div className="table-wrap mt-4">
          <table className="data">
            <thead>
              <tr>
                <th>Metric</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['Total articles', Number(totals.total)],
                ['Published', Number(totals.published)],
                ['Scheduled', Number(totals.scheduled)],
                ['Drafts', Number(totals.draft)],
                ['SEO optimised (80+)', optimised],
                ['Average SEO score', Math.round(Number(totals.avgScore))],
                ['Total words', Number(totals.words)],
                ['Indexed by Google', indexed],
                ['Not indexed', notIndexed],
                ['Never index-checked', unchecked],
                ['Policy clear', Number(policyCounts.pass)],
                ['Policy needs review', Number(policyCounts.review)],
                ['Policy risk', Number(policyCounts.fail)],
                ['Internal links', Number(linkStats.n)],
                ['Keywords available', Number(keywordStats.available)],
                [`Published in the last ${days} days`, published.length],
              ].map(([k, v]) => (
                <tr key={String(k)}>
                  <td className="text-slate-700">{k}</td>
                  <td className="font-semibold tabular-nums text-slate-900">
                    {Number(v).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function bucketLabel(ms: number, days: number): string {
  const d = new Date(ms);
  if (days <= 90) return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return d.toLocaleDateString('en-US', { month: 'short' });
}

function delta(now: number, prev: number): string {
  if (prev === 0) return 'new';
  const pct = Math.round(((now - prev) / prev) * 100);
  return `${pct >= 0 ? '+' : ''}${pct}%`;
}

function isAutoFixOn(s: Record<string, string>): boolean {
  return s['indexing.autoFix'] === '1';
}
