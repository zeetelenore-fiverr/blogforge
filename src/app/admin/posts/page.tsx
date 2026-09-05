import Link from 'next/link';
import { and, desc, eq, like, or, sql, type SQL } from 'drizzle-orm';
import { db, posts, categories, campaigns } from '@/db';
import { requireUser } from '@/lib/auth';
import { timeAgo } from '@/lib/util';
import { PageHeader, StatusBadge, ScorePill, EmptyState } from '@/components/admin/bits';
import { SelectAll, ConfirmButton } from '@/components/admin/ui';
import { bulkPostAction } from '../actions';
import { DemoContentPanel } from '@/components/admin/demo-panel';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ status?: string; q?: string; page?: string; campaign?: string }> };

const PER_PAGE = 25;

export default async function PostsPage({ searchParams }: Props) {
  await requireUser();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);

  const filters: SQL[] = [];
  if (sp.status && sp.status !== 'all') filters.push(eq(posts.status, sp.status as 'draft'));
  if (sp.campaign) filters.push(eq(posts.campaignId, Number(sp.campaign)));
  if (sp.q) {
    const needle = `%${sp.q.replace(/[%_]/g, '')}%`;
    filters.push(or(like(posts.title, needle), like(posts.focusKeyword, needle))!);
  }
  const where = filters.length ? and(...filters) : undefined;

  const [rows, [{ total }], campaignRows] = await Promise.all([
    db
      .select({
        id: posts.id,
        title: posts.title,
        slug: posts.slug,
        status: posts.status,
        seoScore: posts.seoScore,
        wordCount: posts.wordCount,
        focusKeyword: posts.focusKeyword,
        publishedAt: posts.publishedAt,
        scheduledFor: posts.scheduledFor,
        createdAt: posts.createdAt,
        categoryName: categories.name,
        campaignName: campaigns.name,
      })
      .from(posts)
      .leftJoin(categories, eq(categories.id, posts.categoryId))
      .leftJoin(campaigns, eq(campaigns.id, posts.campaignId))
      .where(where)
      .orderBy(desc(posts.createdAt))
      .limit(PER_PAGE)
      .offset((page - 1) * PER_PAGE),
    db.select({ total: sql<number>`COUNT(*)::int` }).from(posts).where(where),
    db.select({ id: campaigns.id, name: campaigns.name }).from(campaigns),
  ]);

  const totalPages = Math.max(1, Math.ceil(Number(total) / PER_PAGE));
  const tabs = [
    { id: 'all', label: 'All' },
    { id: 'published', label: 'Published' },
    { id: 'draft', label: 'Drafts' },
    { id: 'scheduled', label: 'Scheduled' },
  ];
  const current = sp.status || 'all';

  return (
    <div>
      <PageHeader title="Posts" description={`${Number(total)} article${Number(total) === 1 ? '' : 's'}.`}>
        <Link href="/admin/posts/new" className="btn btn-primary">
          Generate article
        </Link>
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1">
          {tabs.map((t) => (
            <Link
              key={t.id}
              href={t.id === 'all' ? '/admin/posts' : `/admin/posts?status=${t.id}`}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                current === t.id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {t.label}
            </Link>
          ))}
        </div>

        <form className="flex gap-2">
          {sp.status && <input type="hidden" name="status" value={sp.status} />}
          <input
            name="q"
            defaultValue={sp.q || ''}
            placeholder="Search title or keyword"
            className="field w-56"
          />
          <button className="btn btn-ghost">Search</button>
        </form>

        {campaignRows.length > 0 && (
          <form className="flex gap-2">
            <select name="campaign" className="field w-48" defaultValue={sp.campaign || ''}>
              <option value="">Any campaign</option>
              {campaignRows.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button className="btn btn-ghost">Filter</button>
          </form>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="space-y-4">
          <EmptyState
            title="No posts here"
            body="Generate one directly, or set up a campaign that publishes on a schedule."
            actionLabel="Generate article"
            actionHref="/admin/posts/new"
          />
          <div className="card p-5">
            <DemoContentPanel />
          </div>
        </div>
      ) : (
        <form action={bulkPostAction}>
          <div className="card table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th className="w-8">
                    <SelectAll />
                  </th>
                  <th>Title</th>
                  <th>Status</th>
                  <th>SEO</th>
                  <th>Words</th>
                  <th>Category</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <input
                        type="checkbox"
                        name="ids"
                        value={p.id}
                        aria-label={`Select ${p.title}`}
                        className="h-4 w-4 rounded border-slate-300 accent-blue-600"
                      />
                    </td>
                    <td className="max-w-sm">
                      <Link href={`/admin/posts/${p.id}`} className="font-medium text-slate-800 hover:underline">
                        {p.title}
                      </Link>
                      <span className="block truncate text-xs text-slate-500">
                        {p.focusKeyword && <>⌕ {p.focusKeyword}</>}
                        {p.campaignName && <> · {p.campaignName}</>}
                      </span>
                    </td>
                    <td>
                      <StatusBadge status={p.status} />
                      {p.status === 'scheduled' && p.scheduledFor && (
                        <span className="block text-[11px] text-slate-500">{timeAgo(p.scheduledFor)}</span>
                      )}
                    </td>
                    <td>
                      <ScorePill score={p.seoScore} />
                    </td>
                    <td className="tabular-nums text-slate-600">{p.wordCount.toLocaleString()}</td>
                    <td className="text-slate-600">{p.categoryName || '—'}</td>
                    <td className="whitespace-nowrap text-xs text-slate-500">{timeAgo(p.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-500">With selected:</span>
            <button name="op" value="publish" className="btn btn-ghost btn-sm">
              Publish
            </button>
            <button name="op" value="draft" className="btn btn-ghost btn-sm">
              Move to draft
            </button>
            <button name="op" value="recheck" className="btn btn-ghost btn-sm">
              Re-run SEO check
            </button>
            <button name="op" value="index-check" className="btn btn-ghost btn-sm">
              Check indexing
            </button>
            <ConfirmButton
              name="op"
              value="delete"
              message="Delete the selected posts permanently?"
            >
              Delete
            </ConfirmButton>
          </div>
        </form>
      )}

      {totalPages > 1 && (
        <nav className="mt-6 flex justify-center gap-1" aria-label="Pagination">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => {
            const params = new URLSearchParams(sp as Record<string, string>);
            params.set('page', String(n));
            return (
              <Link
                key={n}
                href={`/admin/posts?${params}`}
                aria-current={n === page ? 'page' : undefined}
                className={`rounded-lg border px-3 py-1.5 text-sm ${
                  n === page ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                {n}
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
