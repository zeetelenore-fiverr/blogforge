import Link from 'next/link';
import { desc, eq, sql } from 'drizzle-orm';
import { db, posts, indexStatus } from '@/db';
import { requireUser } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { json, timeAgo } from '@/lib/util';
import { gscCredentials, indexNowKey, type IndexIssue } from '@/engine/indexing';
import { PageHeader, EmptyState } from '@/components/admin/bits';
import { ActionForm, SubmitButton, CopyButton } from '@/components/admin/ui';
import { checkIndexingAction, autoFixAction, fixAllAction, submitToIndexNowAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function IndexingPage() {
  await requireUser();
  const s = await getSettings();
  const base = (s['site.url'] || '').replace(/\/+$/, '');
  const gsc = await gscCredentials();
  const inKey = await indexNowKey();

  const rows = await db
    .select({
      post: posts,
      idx: indexStatus,
    })
    .from(posts)
    .leftJoin(indexStatus, eq(indexStatus.postId, posts.id))
    .where(eq(posts.status, 'published'))
    .orderBy(desc(posts.publishedAt))
    .limit(200);

  const withIssues = rows
    .map((r) => ({ ...r, issues: json<IndexIssue[]>(r.idx?.issues || '[]', []) }))
    .filter((r) => r.issues.length > 0);

  const critical = withIssues.filter((r) => r.issues.some((i) => i.severity === 'critical'));
  const notIndexed = rows.filter((r) => r.idx && r.idx.verdict !== 'PASS' && r.idx.verdict !== 'unknown');
  const unchecked = rows.filter((r) => !r.idx?.lastCheckedAt);
  const fixable = withIssues.filter((r) => r.issues.some((i) => i.autoFixable && i.severity !== 'info'));

  return (
    <div>
      <PageHeader
        title="Indexing"
        description="Find pages Google has not indexed, understand why, and let the AI fix the on-page causes it can."
      >
        <form action={checkIndexingAction}>
          <SubmitButton className="btn btn-ghost" pendingLabel="Queueing…">
            Check all pages
          </SubmitButton>
        </form>
        {fixable.length > 0 && (
          <form action={fixAllAction}>
            <SubmitButton className="btn btn-primary" pendingLabel="Queueing…">
              Auto-fix {fixable.length} page{fixable.length === 1 ? '' : 's'}
            </SubmitButton>
          </form>
        )}
      </PageHeader>

      {/* ------------------------------------------------------ connection */}
      {!gsc && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-semibold">Search Console is not connected.</p>
          <p className="mt-1">
            Local checks still run — noindex flags, thin content, orphan pages, duplicate metadata and every failing
            on-page check. To read Google&rsquo;s actual coverage verdict, add a service account under{' '}
            <Link href="/admin/settings" className="font-semibold underline">
              Settings → Search Console
            </Link>
            .
          </p>
        </div>
      )}

      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        <Stat label="Published pages" value={rows.length} />
        <Stat label="Never checked" value={unchecked.length} />
        <Stat label="Not indexed" value={notIndexed.length} tone={notIndexed.length ? 'warn' : undefined} />
        <Stat label="Critical issues" value={critical.length} tone={critical.length ? 'bad' : undefined} />
      </div>

      {/* -------------------------------------------------------- IndexNow */}
      <section className="card mb-6 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">IndexNow</h2>
            <p className="mt-1 max-w-xl text-sm text-slate-600">
              Push URLs straight to Bing, Yandex, Seznam and Naver the moment they publish. Free, no account — the
              verification key is generated from your APP_SECRET and served automatically.
            </p>
            <p className="mt-2 font-mono text-xs text-slate-500">
              {base ? `${base}/indexnow/${inKey}.txt` : `/indexnow/${inKey}.txt`}
            </p>
          </div>
          <div className="flex gap-2">
            <CopyButton value={inKey} label="Copy key" />
            <form action={submitToIndexNowAction}>
              <SubmitButton className="btn btn-ghost btn-sm" pendingLabel="Submitting…">
                Submit all URLs
              </SubmitButton>
            </form>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- table */}
      {rows.length === 0 ? (
        <EmptyState title="Nothing published yet" body="Indexing checks apply to live URLs only." />
      ) : (
        <div className="space-y-3">
          {rows.map(({ post, idx }) => {
            const issues = json<IndexIssue[]>(idx?.issues || '[]', []);
            const fixes = json<string[]>(idx?.fixesApplied || '[]', []);
            const worst = issues.some((i) => i.severity === 'critical')
              ? 'critical'
              : issues.some((i) => i.severity === 'warning')
                ? 'warning'
                : issues.length
                  ? 'info'
                  : 'clean';

            return (
              <article key={post.id} className="card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/admin/posts/${post.id}`}
                        className="font-medium text-slate-900 hover:underline"
                      >
                        {post.title}
                      </Link>
                      <span
                        className={`badge ${
                          worst === 'critical'
                            ? 'badge-bad'
                            : worst === 'warning'
                              ? 'badge-warn'
                              : worst === 'info'
                                ? 'badge-mute'
                                : 'badge-good'
                        }`}
                      >
                        {worst === 'clean' ? 'no issues' : `${issues.length} issue${issues.length === 1 ? '' : 's'}`}
                      </span>
                      {idx?.autoFixed && <span className="badge badge-info">auto-fixed</span>}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {idx?.lastCheckedAt ? (
                        <>
                          {idx.coverageState}
                          {idx.verdict !== 'unknown' && ` · verdict ${idx.verdict}`}
                          {idx.lastCrawlTime && ` · crawled ${new Date(idx.lastCrawlTime).toLocaleDateString()}`}
                          {' · checked '}
                          {timeAgo(idx.lastCheckedAt)}
                        </>
                      ) : (
                        'Never checked'
                      )}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <form action={checkIndexingAction}>
                      <input type="hidden" name="id" value={post.id} />
                      <SubmitButton className="btn btn-ghost btn-sm" pendingLabel="Checking…">
                        Check
                      </SubmitButton>
                    </form>
                    {issues.some((i) => i.autoFixable) && (
                      <ActionForm action={autoFixAction}>
                        <input type="hidden" name="id" value={post.id} />
                        <SubmitButton className="btn btn-primary btn-sm" pendingLabel="Fixing…">
                          Auto-fix
                        </SubmitButton>
                      </ActionForm>
                    )}
                  </div>
                </div>

                {issues.length > 0 && (
                  <ul className="mt-3 space-y-1.5 border-t border-slate-100 pt-3">
                    {issues.map((i) => (
                      <li key={i.id} className="flex items-start gap-2 text-xs">
                        <span
                          className={`badge ${
                            i.severity === 'critical' ? 'badge-bad' : i.severity === 'warning' ? 'badge-warn' : 'badge-mute'
                          }`}
                        >
                          {i.severity}
                        </span>
                        <span className="min-w-0">
                          <span className="font-medium text-slate-800">{i.title}</span>
                          <span className="block text-slate-600">{i.detail}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                {fixes.length > 0 && (
                  <div className="mt-3 rounded-lg bg-green-50 px-3 py-2">
                    <p className="text-xs font-semibold text-green-800">Fixes already applied</p>
                    <ul className="mt-1 space-y-0.5 text-xs text-green-700">
                      {fixes.map((f, i) => (
                        <li key={i}>· {f}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'warn' | 'bad' }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p
        className={`mt-1 text-2xl font-bold tabular-nums ${
          tone === 'bad' ? 'text-red-600' : tone === 'warn' ? 'text-amber-600' : 'text-slate-900'
        }`}
      >
        {value}
      </p>
    </div>
  );
}
