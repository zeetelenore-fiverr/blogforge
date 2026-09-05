import Link from 'next/link';
import { asc, desc, eq, ne, sql } from 'drizzle-orm';
import { db, posts } from '@/db';
import { requireUser } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { json } from '@/lib/util';
import { analyzeSeo, type SeoCheck } from '@/engine/seo-analyzer';
import { PageHeader, ScorePill, ScoreRing, EmptyState } from '@/components/admin/bits';
import { ActionForm, SubmitButton, Collapse } from '@/components/admin/ui';
import { pageSpeedAction, bulkPostAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function SeoPage() {
  await requireUser();
  const s = await getSettings();
  const base = (s['site.url'] || '').replace(/\/+$/, '');

  const rows = await db
    .select()
    .from(posts)
    .where(ne(posts.status, 'failed'))
    .orderBy(asc(posts.seoScore))
    .limit(200);

  // Re-run the analyzer live so the page reflects the current content, not the
  // score frozen at generation time.
  const analysed = rows.map((p) => ({
    post: p,
    report: analyzeSeo({
      title: p.title,
      slug: p.slug,
      metaTitle: p.metaTitle,
      metaDescription: p.metaDescription,
      excerpt: p.excerpt,
      contentMd: p.contentMd,
      focusKeyword: p.focusKeyword,
      secondaryKeywords: json<string[]>(p.secondaryKeywords, []),
      featuredImage: p.featuredImage,
      featuredImageAlt: p.featuredImageAlt,
      schemaJson: p.schemaJson,
      canonicalUrl: p.canonicalUrl,
      noindex: p.noindex,
    }),
  }));

  const avg = analysed.length
    ? Math.round(analysed.reduce((sum, a) => sum + a.report.score, 0) / analysed.length)
    : 0;

  // Which checks fail most often across the whole site.
  const tally = new Map<string, { check: SeoCheck; count: number }>();
  for (const a of analysed) {
    for (const c of a.report.checks) {
      if (c.status === 'pass') continue;
      const hit = tally.get(c.id);
      if (hit) hit.count++;
      else tally.set(c.id, { check: c, count: 1 });
    }
  }
  const common = [...tally.values()].sort((x, y) => y.count - x.count).slice(0, 10);

  const dupTitles = await db
    .select({ metaTitle: posts.metaTitle, n: sql<number>`COUNT(*)::int` })
    .from(posts)
    .where(ne(posts.metaTitle, ''))
    .groupBy(posts.metaTitle)
    .having(sql`COUNT(*) > 1`);

  const dupDescriptions = await db
    .select({ metaDescription: posts.metaDescription, n: sql<number>`COUNT(*)::int` })
    .from(posts)
    .where(ne(posts.metaDescription, ''))
    .groupBy(posts.metaDescription)
    .having(sql`COUNT(*) > 1`);

  return (
    <div>
      <PageHeader
        title="On-page SEO"
        description="Every published and draft article, scored against 30+ on-page checks. Runs locally — no API, no quota."
      />

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <div className="card flex items-center gap-4 p-5">
          <ScoreRing score={avg} size={64} />
          <div>
            <p className="text-sm font-semibold text-slate-900">Site average</p>
            <p className="text-xs text-slate-500">{analysed.length} articles analysed</p>
          </div>
        </div>

        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Score distribution</p>
          <ul className="mt-2 space-y-1.5 text-xs">
            {[
              ['90–100 (A)', analysed.filter((a) => a.report.score >= 90).length, 'bg-green-500'],
              ['80–89 (B)', analysed.filter((a) => a.report.score >= 80 && a.report.score < 90).length, 'bg-lime-500'],
              ['70–79 (C)', analysed.filter((a) => a.report.score >= 70 && a.report.score < 80).length, 'bg-amber-500'],
              ['Below 70', analysed.filter((a) => a.report.score < 70).length, 'bg-red-500'],
            ].map(([label, count, colour]) => (
              <li key={label as string} className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${colour}`} />
                <span className="flex-1 text-slate-600">{label as string}</span>
                <span className="font-semibold tabular-nums text-slate-900">{count as number}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Duplicate metadata</p>
          <p className="mt-2 text-sm text-slate-700">
            {dupTitles.length} duplicate title{dupTitles.length === 1 ? '' : 's'},{' '}
            {dupDescriptions.length} duplicate description{dupDescriptions.length === 1 ? '' : 's'}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Duplicates are the usual cause of &ldquo;Alternate page with proper canonical tag&rdquo;.
          </p>
        </div>
      </div>

      {common.length > 0 && (
        <section className="card mb-6 p-5">
          <h2 className="text-sm font-semibold text-slate-900">Most common problems</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {common.map(({ check, count }) => (
              <li key={check.id} className="flex items-start gap-2 text-xs">
                <span className={`badge ${check.status === 'fail' ? 'badge-bad' : 'badge-warn'}`}>{count}</span>
                <span>
                  <span className="font-medium text-slate-800">{check.label}</span>
                  {check.fix && <span className="block text-slate-500">{check.fix}</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Collapse title="Run a Core Web Vitals check (PageSpeed Insights)">
        <ActionForm action={pageSpeedAction} className="space-y-3">
          <div className="flex gap-2">
            <input
              name="url"
              className="field flex-1"
              placeholder={base ? `${base}/blog/some-article` : 'https://example.com/blog/some-article'}
              defaultValue={base || ''}
            />
            <SubmitButton pendingLabel="Testing… up to 60s">Run test</SubmitButton>
          </div>
          <p className="hint">
            Works without a key at a low rate limit. Add a free PageSpeed key under AI providers to raise it. The URL
            must be publicly reachable — localhost will fail.
          </p>
        </ActionForm>
      </Collapse>

      <h2 className="mb-3 mt-8 text-base font-semibold text-slate-900">Every article, worst first</h2>

      {analysed.length === 0 ? (
        <EmptyState title="Nothing to analyse" body="Generate an article first." actionLabel="Generate article" actionHref="/admin/posts/new" />
      ) : (
        <form action={bulkPostAction}>
          <div className="card table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th className="w-8" />
                  <th>Article</th>
                  <th>Score</th>
                  <th>Words</th>
                  <th>Links</th>
                  <th>Top issues</th>
                </tr>
              </thead>
              <tbody>
                {analysed.map(({ post, report }) => {
                  const issues = report.checks.filter((c) => c.status === 'fail').slice(0, 3);
                  return (
                    <tr key={post.id}>
                      <td>
                        <input
                          type="checkbox"
                          name="ids"
                          value={post.id}
                          aria-label={`Select ${post.title}`}
                          className="h-4 w-4 rounded border-slate-300 accent-blue-600"
                        />
                      </td>
                      <td className="max-w-xs">
                        <Link href={`/admin/posts/${post.id}`} className="font-medium text-slate-800 hover:underline">
                          {post.title}
                        </Link>
                        <span className="block truncate text-xs text-slate-500">⌕ {post.focusKeyword || '—'}</span>
                      </td>
                      <td>
                        <ScorePill score={report.score} />
                      </td>
                      <td className="tabular-nums text-slate-600">{report.stats.words.toLocaleString()}</td>
                      <td className="tabular-nums text-slate-600">
                        {report.stats.internalLinks}/{report.stats.externalLinks}
                      </td>
                      <td className="max-w-sm">
                        {issues.length === 0 ? (
                          <span className="text-xs text-green-600">No failures</span>
                        ) : (
                          <ul className="space-y-0.5 text-xs text-slate-600">
                            {issues.map((c) => (
                              <li key={c.id}>· {c.label}</li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-500">With selected:</span>
            <button name="op" value="recheck" className="btn btn-ghost btn-sm">
              Re-score and rebuild schema
            </button>
            <button name="op" value="index-check" className="btn btn-ghost btn-sm">
              Queue indexing check
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
