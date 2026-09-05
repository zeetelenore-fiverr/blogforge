import Link from 'next/link';
import { desc, eq, sql } from 'drizzle-orm';
import { db, posts, internalLinks } from '@/db';
import { requireUser } from '@/lib/auth';
import { timeAgo } from '@/lib/util';
import { PageHeader, EmptyState } from '@/components/admin/bits';
import { SubmitButton } from '@/components/admin/ui';
import { relinkPostAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function LinksPage() {
  await requireUser();

  const rows = await db
    .select({
      id: posts.id,
      title: posts.title,
      slug: posts.slug,
      status: posts.status,
      publishedAt: posts.publishedAt,
      inbound: sql<number>`(SELECT COUNT(*)::int FROM internal_links WHERE target_post_id = ${posts.id})`,
      outbound: sql<number>`(SELECT COUNT(*)::int FROM internal_links WHERE source_post_id = ${posts.id})`,
    })
    .from(posts)
    .where(eq(posts.status, 'published'))
    .orderBy(desc(posts.publishedAt))
    .limit(300);

  const recent = await db
    .select({
      anchor: internalLinks.anchor,
      createdAt: internalLinks.createdAt,
      sourceId: internalLinks.sourcePostId,
      targetId: internalLinks.targetPostId,
    })
    .from(internalLinks)
    .orderBy(desc(internalLinks.id))
    .limit(15);

  const orphans = rows.filter((r) => Number(r.inbound) === 0);
  const deadEnds = rows.filter((r) => Number(r.outbound) === 0);
  const totalLinks = rows.reduce((n, r) => n + Number(r.outbound), 0);
  const avgOut = rows.length ? (totalLinks / rows.length).toFixed(1) : '0';

  return (
    <div>
      <PageHeader
        title="Internal links"
        description="Links are added automatically as articles are generated — both outward from the new post and inward from older ones. This is where you see the resulting shape."
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        <Stat label="Published pages" value={String(rows.length)} />
        <Stat label="Internal links" value={String(totalLinks)} />
        <Stat label="Average out-links" value={avgOut} />
        <Stat label="Orphan pages" value={String(orphans.length)} tone={orphans.length ? 'bad' : undefined} />
      </div>

      {orphans.length > 0 && (
        <section className="card mb-6 p-5">
          <h2 className="text-sm font-semibold text-slate-900">Orphan pages</h2>
          <p className="mt-1 text-sm text-slate-600">
            Nothing on the site links to these. They rely entirely on the sitemap for discovery, which is exactly the
            profile Google files under &ldquo;Discovered — currently not indexed&rdquo;.
          </p>
          <ul className="mt-3 space-y-2">
            {orphans.slice(0, 20).map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-2">
                <Link href={`/admin/posts/${o.id}`} className="text-sm text-slate-800 hover:underline">
                  {o.title}
                </Link>
                <form action={relinkPostAction}>
                  <input type="hidden" name="id" value={o.id} />
                  <SubmitButton className="btn btn-ghost btn-sm" pendingLabel="Linking…">
                    Build links
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      {rows.length === 0 ? (
        <EmptyState title="No published posts" body="Internal linking starts once you have two or more live articles." />
      ) : (
        <div className="card table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Article</th>
                <th>Inbound</th>
                <th>Outbound</th>
                <th>Published</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="max-w-md">
                    <Link href={`/admin/posts/${r.id}`} className="font-medium text-slate-800 hover:underline">
                      {r.title}
                    </Link>
                  </td>
                  <td>
                    <span className={`badge ${Number(r.inbound) === 0 ? 'badge-bad' : 'badge-good'}`}>
                      {Number(r.inbound)}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${Number(r.outbound) === 0 ? 'badge-warn' : 'badge-mute'}`}>
                      {Number(r.outbound)}
                    </span>
                  </td>
                  <td className="whitespace-nowrap text-xs text-slate-500">{timeAgo(r.publishedAt)}</td>
                  <td>
                    <form action={relinkPostAction}>
                      <input type="hidden" name="id" value={r.id} />
                      <SubmitButton className="btn btn-ghost btn-sm" pendingLabel="…">
                        Rebuild
                      </SubmitButton>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {recent.length > 0 && (
        <section className="card mt-6 p-5">
          <h2 className="text-sm font-semibold text-slate-900">Recently added links</h2>
          <ul className="mt-3 space-y-1.5 text-xs text-slate-600">
            {recent.map((l, i) => (
              <li key={i}>
                <Link href={`/admin/posts/${l.sourceId}`} className="hover:underline">
                  #{l.sourceId}
                </Link>{' '}
                → <span className="font-medium text-slate-800">“{l.anchor}”</span> →{' '}
                <Link href={`/admin/posts/${l.targetId}`} className="hover:underline">
                  #{l.targetId}
                </Link>
                <span className="ml-2 text-slate-400">{timeAgo(l.createdAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {deadEnds.length > 0 && (
        <p className="mt-6 text-xs text-slate-500">
          {deadEnds.length} page{deadEnds.length === 1 ? '' : 's'} link nowhere. That is less harmful than an orphan,
          but every article should point readers somewhere next.
        </p>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'bad' }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${tone === 'bad' ? 'text-red-600' : 'text-slate-900'}`}>
        {value}
      </p>
    </div>
  );
}
