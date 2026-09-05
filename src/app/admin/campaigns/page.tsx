import Link from 'next/link';
import { desc, eq, sql } from 'drizzle-orm';
import { db, campaigns, categories } from '@/db';
import { requireUser } from '@/lib/auth';
import { timeAgo } from '@/lib/util';
import { PageHeader, StatusBadge, EmptyState } from '@/components/admin/bits';
import { SubmitButton } from '@/components/admin/ui';
import { toggleCampaignAction, runCampaignNowAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function CampaignsPage() {
  await requireUser();

  const rows = await db
    .select({
      c: campaigns,
      categoryName: categories.name,
      posts: sql<number>`(SELECT COUNT(*)::int FROM posts WHERE posts.campaign_id = ${campaigns.id})`,
    })
    .from(campaigns)
    .leftJoin(categories, eq(categories.id, campaigns.categoryId))
    .orderBy(desc(campaigns.createdAt));

  return (
    <div>
      <PageHeader
        title="Campaigns"
        description="A campaign is a topic, a schedule and a set of writing rules. Leave one running and the blog fills itself."
      >
        <Link href="/admin/campaigns/new" className="btn btn-primary">
          New campaign
        </Link>
      </PageHeader>

      {rows.length === 0 ? (
        <EmptyState
          title="No campaigns yet"
          body="Create one with a handful of keywords and an interval — one article a day is a sensible start for a new site."
          actionLabel="Create a campaign"
          actionHref="/admin/campaigns/new"
        />
      ) : (
        <ul className="space-y-3">
          {rows.map(({ c, categoryName, posts }) => (
            <li key={c.id} className="card p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/admin/campaigns/${c.id}`}
                      className="text-base font-semibold text-slate-900 hover:underline"
                    >
                      {c.name}
                    </Link>
                    <StatusBadge status={c.status} />
                    {c.publishStatus === 'published' && <span className="badge badge-info">auto-publish</span>}
                  </div>

                  <p className="mt-1.5 text-sm text-slate-600">
                    {describeInterval(c.intervalMinutes, c.articlesPerRun)}
                    {' · '}
                    {c.wordCount.toLocaleString()} words
                    {categoryName && ` · ${categoryName}`}
                  </p>

                  <p className="mt-1 text-xs text-slate-500">
                    {Number(posts)} article{Number(posts) === 1 ? '' : 's'} generated
                    {c.maxArticles > 0 && ` of ${c.maxArticles}`}
                    {c.lastRunAt && ` · last run ${timeAgo(c.lastRunAt)}`}
                    {c.status === 'active' && c.nextRunAt && ` · next ${timeAgo(c.nextRunAt)}`}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <form action={runCampaignNowAction}>
                    <input type="hidden" name="id" value={c.id} />
                    <SubmitButton className="btn btn-ghost btn-sm" pendingLabel="Queueing…">
                      Run once now
                    </SubmitButton>
                  </form>
                  <form action={toggleCampaignAction}>
                    <input type="hidden" name="id" value={c.id} />
                    <SubmitButton className="btn btn-ghost btn-sm">
                      {c.status === 'active' ? 'Pause' : 'Activate'}
                    </SubmitButton>
                  </form>
                  <Link href={`/admin/campaigns/${c.id}`} className="btn btn-ghost btn-sm">
                    Edit
                  </Link>
                </div>
              </div>

              {c.maxArticles > 0 && (
                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-blue-600"
                    style={{ width: `${Math.min(100, (c.generatedCount / c.maxArticles) * 100)}%` }}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function describeInterval(minutes: number, perRun: number): string {
  const each = perRun > 1 ? `${perRun} articles` : '1 article';
  if (minutes < 60) return `${each} every ${minutes} min`;
  if (minutes < 1440) return `${each} every ${Math.round(minutes / 60)} h`;
  if (minutes === 1440) return `${each} a day`;
  if (minutes < 10080) return `${each} every ${Math.round(minutes / 1440)} days`;
  return `${each} every ${Math.round(minutes / 10080)} week(s)`;
}
