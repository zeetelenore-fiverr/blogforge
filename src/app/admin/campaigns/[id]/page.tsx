import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, asc, desc, eq } from 'drizzle-orm';
import { db, campaigns, categories, users, providers, posts, keywords } from '@/db';
import { requireUser } from '@/lib/auth';
import { timeAgo } from '@/lib/util';
import { PageHeader, StatusBadge, ScorePill } from '@/components/admin/bits';
import { SubmitButton, ConfirmButton } from '@/components/admin/ui';
import { CampaignForm, type CampaignFormData } from '@/components/admin/campaign-form';
import { toggleCampaignAction, runCampaignNowAction, deleteCampaignAction } from '../../actions';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

export default async function CampaignPage({ params }: Props) {
  await requireUser();
  const { id } = await params;
  const campaignId = Number(id);

  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));
  if (!campaign) notFound();

  const [cats, authors, text, image, produced, queuedKeywords] = await Promise.all([
    db.select({ id: categories.id, name: categories.name }).from(categories).orderBy(asc(categories.name)),
    db.select({ id: users.id, name: users.name }).from(users).orderBy(asc(users.name)),
    db
      .select({ id: providers.id, label: providers.label })
      .from(providers)
      .where(and(eq(providers.kind, 'text'), eq(providers.enabled, true))),
    db
      .select({ id: providers.id, label: providers.label })
      .from(providers)
      .where(and(eq(providers.kind, 'image'), eq(providers.enabled, true))),
    db
      .select({
        id: posts.id,
        title: posts.title,
        status: posts.status,
        seoScore: posts.seoScore,
        createdAt: posts.createdAt,
      })
      .from(posts)
      .where(eq(posts.campaignId, campaignId))
      .orderBy(desc(posts.createdAt))
      .limit(15),
    db
      .select({ keyword: keywords.keyword, status: keywords.status })
      .from(keywords)
      .where(eq(keywords.campaignId, campaignId))
      .limit(20),
  ]);

  const data: CampaignFormData = {
    id: campaign.id,
    name: campaign.name,
    status: campaign.status,
    keywordSource: campaign.keywordSource,
    seedKeywords: campaign.seedKeywords,
    promptTemplate: campaign.promptTemplate,
    wordCount: campaign.wordCount,
    tone: campaign.tone,
    language: campaign.language,
    audience: campaign.audience,
    pointOfView: campaign.pointOfView,
    categoryId: campaign.categoryId,
    authorId: campaign.authorId,
    publishStatus: campaign.publishStatus,
    intervalMinutes: campaign.intervalMinutes,
    articlesPerRun: campaign.articlesPerRun,
    maxArticles: campaign.maxArticles,
    featuredImageEnabled: campaign.featuredImageEnabled,
    inlineImages: campaign.inlineImages,
    imageStyle: campaign.imageStyle,
    internalLinksEnabled: campaign.internalLinksEnabled,
    maxInternalLinks: campaign.maxInternalLinks,
    externalLinksEnabled: campaign.externalLinksEnabled,
    faqEnabled: campaign.faqEnabled,
    tocEnabled: campaign.tocEnabled,
    keyTakeawaysEnabled: campaign.keyTakeawaysEnabled,
    tableEnabled: campaign.tableEnabled,
    schemaType: campaign.schemaType,
    textProviderId: campaign.textProviderId,
    imageProviderId: campaign.imageProviderId,
  };

  return (
    <div>
      <PageHeader title={campaign.name} description={`Campaign #${campaign.id}`}>
        <form action={runCampaignNowAction}>
          <input type="hidden" name="id" value={campaign.id} />
          <SubmitButton className="btn btn-ghost" pendingLabel="Queueing…">
            Run once now
          </SubmitButton>
        </form>
        <form action={toggleCampaignAction}>
          <input type="hidden" name="id" value={campaign.id} />
          <SubmitButton className={campaign.status === 'active' ? 'btn btn-ghost' : 'btn btn-primary'}>
            {campaign.status === 'active' ? 'Pause' : 'Activate'}
          </SubmitButton>
        </form>
      </PageHeader>

      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        <Stat label="Status" value={campaign.status} />
        <Stat label="Generated" value={String(campaign.generatedCount)} />
        <Stat label="Last run" value={campaign.lastRunAt ? timeAgo(campaign.lastRunAt) : '—'} />
        <Stat
          label="Next run"
          value={campaign.status === 'active' && campaign.nextRunAt ? timeAgo(campaign.nextRunAt) : 'paused'}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          <CampaignForm campaign={data} categories={cats} authors={authors} textProviders={text} imageProviders={image} />

          <form action={deleteCampaignAction} className="mt-6 flex justify-end">
            <input type="hidden" name="id" value={campaign.id} />
            <ConfirmButton message={`Delete "${campaign.name}"? Its articles are kept.`}>
              Delete campaign
            </ConfirmButton>
          </form>
        </div>

        <aside className="space-y-5">
          <section className="card p-5">
            <h2 className="text-sm font-semibold text-slate-900">Articles produced</h2>
            {produced.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">Nothing yet.</p>
            ) : (
              <ul className="mt-3 space-y-2.5">
                {produced.map((p) => (
                  <li key={p.id} className="text-xs">
                    <Link href={`/admin/posts/${p.id}`} className="font-medium text-slate-800 hover:underline">
                      {p.title}
                    </Link>
                    <span className="mt-1 flex items-center gap-2">
                      <StatusBadge status={p.status} />
                      <ScorePill score={p.seoScore} />
                      <span className="text-slate-400">{timeAgo(p.createdAt)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {queuedKeywords.length > 0 && (
            <section className="card p-5">
              <h2 className="text-sm font-semibold text-slate-900">Keywords in this campaign</h2>
              <ul className="mt-3 space-y-1 text-xs">
                {queuedKeywords.map((k) => (
                  <li key={k.keyword} className="flex items-center justify-between gap-2">
                    <span className="truncate text-slate-700">{k.keyword}</span>
                    <span className={`badge ${k.status === 'used' ? 'badge-good' : 'badge-mute'}`}>{k.status}</span>
                  </li>
                ))}
              </ul>
              <Link href="/admin/keywords" className="mt-3 inline-block text-xs font-medium text-blue-600 hover:underline">
                Keyword manager →
              </Link>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}
