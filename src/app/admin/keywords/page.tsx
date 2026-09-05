import Link from 'next/link';
import { and, desc, eq, like, sql, type SQL } from 'drizzle-orm';
import { db, keywords, keywordClusters, campaigns, posts } from '@/db';
import { requireUser } from '@/lib/auth';
import { json, timeAgo } from '@/lib/util';
import { PageHeader, EmptyState } from '@/components/admin/bits';
import { ActionForm, SubmitButton, SelectAll, ConfirmButton, Collapse, Toggle } from '@/components/admin/ui';
import { researchKeywordsAction, addKeywordsAction, keywordBulkAction } from '../actions';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ status?: string; q?: string; cluster?: string }> };

export default async function KeywordsPage({ searchParams }: Props) {
  await requireUser();
  const sp = await searchParams;

  const filters: SQL[] = [];
  if (sp.status && sp.status !== 'all') filters.push(eq(keywords.status, sp.status as 'new'));
  if (sp.cluster) filters.push(eq(keywords.clusterId, Number(sp.cluster)));
  if (sp.q) filters.push(like(keywords.keyword, `%${sp.q.replace(/[%_]/g, '')}%`));
  const where = filters.length ? and(...filters) : undefined;

  const [rows, clusters, camps, [counts]] = await Promise.all([
    db
      .select({
        k: keywords,
        clusterName: keywordClusters.name,
        campaignName: campaigns.name,
        postTitle: posts.title,
      })
      .from(keywords)
      .leftJoin(keywordClusters, eq(keywordClusters.id, keywords.clusterId))
      .leftJoin(campaigns, eq(campaigns.id, keywords.campaignId))
      .leftJoin(posts, eq(posts.id, keywords.postId))
      .where(where)
      .orderBy(sql`COALESCE(${keywords.difficulty}, 50) ASC`, desc(keywords.id))
      .limit(300),
    db
      .select({
        id: keywordClusters.id,
        name: keywordClusters.name,
        pillarKeyword: keywordClusters.pillarKeyword,
        n: sql<number>`(SELECT COUNT(*)::int FROM keywords WHERE keywords.cluster_id = ${keywordClusters.id})`,
      })
      .from(keywordClusters),
    db.select({ id: campaigns.id, name: campaigns.name }).from(campaigns),
    db
      .select({
        total: sql<number>`COUNT(*)::int`,
        fresh: sql<number>`COALESCE(SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END), 0)::int`,
        used: sql<number>`COALESCE(SUM(CASE WHEN status = 'used' THEN 1 ELSE 0 END), 0)::int`,
      })
      .from(keywords),
  ]);

  const current = sp.status || 'all';
  const tabs = [
    { id: 'all', label: `All (${Number(counts.total) || 0})` },
    { id: 'new', label: `Unused (${Number(counts.fresh) || 0})` },
    { id: 'queued', label: 'Queued' },
    { id: 'used', label: `Written (${Number(counts.used) || 0})` },
    { id: 'rejected', label: 'Rejected' },
  ];

  return (
    <div>
      <PageHeader
        title="Keywords"
        description="Free research: Google Autocomplete for real queries, Datamuse and Wikipedia for entity coverage, and your AI provider for intent, clustering and difficulty."
      />

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        {/* -------------------------------------------------------- research */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-slate-900">Research a topic</h2>
          <ActionForm action={researchKeywordsAction} className="mt-3 space-y-3">
            <div>
              <label className="label" htmlFor="seed">
                Seed keyword or topic
              </label>
              <input id="seed" name="seed" required placeholder="home espresso" className="field" />
            </div>
            <div>
              <label className="label" htmlFor="context">
                Site context (optional)
              </label>
              <input
                id="context"
                name="context"
                placeholder="A blog for beginners buying their first espresso machine"
                className="field"
              />
              <p className="hint">Sharpens the AI pass — worth a sentence.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="limit">
                  How many
                </label>
                <input id="limit" name="limit" type="number" min={10} max={200} defaultValue={50} className="field" />
              </div>
              {camps.length > 0 && (
                <div>
                  <label className="label" htmlFor="campaignId">
                    Assign to campaign
                  </label>
                  <select id="campaignId" name="campaignId" className="field">
                    <option value="">None</option>
                    {camps.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <Toggle name="skipAi" label="Skip the AI pass" hint="Faster, and works with no text provider configured." />
            <SubmitButton pendingLabel="Researching… 10–30s">Research keywords</SubmitButton>
          </ActionForm>
        </div>

        {/* ------------------------------------------------------ paste list */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-slate-900">Or paste your own</h2>
          <ActionForm action={addKeywordsAction} className="mt-3 space-y-3" resetOnSuccess>
            <div>
              <label className="label" htmlFor="keywords">
                One keyword per line
              </label>
              <textarea
                id="keywords"
                name="keywords"
                rows={8}
                className="field font-mono text-xs"
                placeholder={'best espresso machine under 500\nhow to descale a breville\nespresso vs drip coffee'}
              />
            </div>
            {camps.length > 0 && (
              <div>
                <label className="label" htmlFor="paste-campaign">
                  Assign to campaign
                </label>
                <select id="paste-campaign" name="campaignId" className="field">
                  <option value="">None</option>
                  {camps.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <SubmitButton className="btn btn-ghost" pendingLabel="Adding…">
              Add keywords
            </SubmitButton>
          </ActionForm>
        </div>
      </div>

      {clusters.length > 0 && (
        <Collapse title="Topic clusters" badge={`${clusters.length}`}>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {clusters.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/admin/keywords?cluster=${c.id}`}
                  className="block rounded-lg border border-slate-200 p-3 hover:border-slate-300"
                >
                  <p className="text-sm font-semibold text-slate-800">{c.name}</p>
                  <p className="text-xs text-slate-500">
                    pillar: {c.pillarKeyword || '—'} · {Number(c.n)} keywords
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </Collapse>
      )}

      <div className="my-4 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 overflow-x-auto rounded-lg border border-slate-200 bg-white p-1">
          {tabs.map((t) => (
            <Link
              key={t.id}
              href={t.id === 'all' ? '/admin/keywords' : `/admin/keywords?status=${t.id}`}
              className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ${
                current === t.id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {t.label}
            </Link>
          ))}
        </div>
        <form className="flex gap-2">
          <input name="q" defaultValue={sp.q || ''} placeholder="Filter keywords" className="field w-52" />
          <button className="btn btn-ghost">Filter</button>
        </form>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No keywords yet" body="Research a seed topic above, or paste a list you already have." />
      ) : (
        <form action={keywordBulkAction}>
          <div className="card table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th className="w-8">
                    <SelectAll />
                  </th>
                  <th>Keyword</th>
                  <th>Intent</th>
                  <th>Difficulty</th>
                  <th>Source</th>
                  <th>Status</th>
                  <th>Article</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ k, clusterName, campaignName, postTitle }) => {
                  const meta = json<{ titleIdea?: string }>(k.meta, {});
                  return (
                    <tr key={k.id}>
                      <td>
                        <input
                          type="checkbox"
                          name="ids"
                          value={k.id}
                          aria-label={`Select ${k.keyword}`}
                          className="h-4 w-4 rounded border-slate-300 accent-blue-600"
                        />
                      </td>
                      <td className="max-w-sm">
                        <span className="font-medium text-slate-800">{k.keyword}</span>
                        {meta.titleIdea && (
                          <span className="block truncate text-xs text-slate-500">→ {meta.titleIdea}</span>
                        )}
                        {(clusterName || campaignName) && (
                          <span className="block text-[11px] text-slate-400">
                            {clusterName && `cluster: ${clusterName}`}
                            {clusterName && campaignName && ' · '}
                            {campaignName && `campaign: ${campaignName}`}
                          </span>
                        )}
                      </td>
                      <td className="text-slate-600">{k.intent || '—'}</td>
                      <td>
                        <DifficultyBar value={k.difficulty ?? 50} />
                      </td>
                      <td className="text-xs text-slate-500">{k.source}</td>
                      <td>
                        <span
                          className={`badge ${
                            k.status === 'used'
                              ? 'badge-good'
                              : k.status === 'queued'
                                ? 'badge-info'
                                : k.status === 'rejected'
                                  ? 'badge-bad'
                                  : 'badge-mute'
                          }`}
                        >
                          {k.status}
                        </span>
                      </td>
                      <td className="max-w-xs">
                        {postTitle ? (
                          <Link href={`/admin/posts/${k.postId}`} className="truncate text-xs text-blue-600 hover:underline">
                            {postTitle}
                          </Link>
                        ) : (
                          <Link
                            href={`/admin/posts/new?keyword=${encodeURIComponent(k.keyword)}`}
                            className="text-xs text-slate-500 hover:text-blue-600 hover:underline"
                          >
                            Write now →
                          </Link>
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
            <button name="op" value="generate" className="btn btn-primary btn-sm">
              Generate articles
            </button>
            <button name="op" value="cluster" className="btn btn-ghost btn-sm">
              Group into clusters
            </button>
            <button name="op" value="queue" className="btn btn-ghost btn-sm">
              Mark queued
            </button>
            <button name="op" value="reject" className="btn btn-ghost btn-sm">
              Reject
            </button>
            {camps.length > 0 && (
              <span className="flex items-center gap-1">
                <select name="campaignId" className="field w-40 py-1 text-xs">
                  <option value="">Campaign…</option>
                  {camps.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <button name="op" value="assign" className="btn btn-ghost btn-sm">
                  Assign
                </button>
              </span>
            )}
            <ConfirmButton name="op" value="delete" message="Delete the selected keywords?">
              Delete
            </ConfirmButton>
          </div>
        </form>
      )}
    </div>
  );
}

function DifficultyBar({ value }: { value: number }) {
  const tone = value <= 30 ? 'bg-green-500' : value <= 60 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <span className="flex items-center gap-2" title={`Estimated difficulty ${value}/100`}>
      <span className="h-1.5 w-14 overflow-hidden rounded-full bg-slate-100">
        <span className={`block h-full rounded-full ${tone}`} style={{ width: `${value}%` }} />
      </span>
      <span className="text-xs tabular-nums text-slate-500">{value}</span>
    </span>
  );
}
