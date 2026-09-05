import Link from 'next/link';
import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { db, posts, campaigns, keywords, jobs, providers, logs } from '@/db';
import { requireUser } from '@/lib/auth';
import { getSettings, isOn } from '@/lib/settings';
import { timeAgo, formatDate } from '@/lib/util';
import { runTickAction } from './actions';
import { SubmitButton, AutoRefresh } from '@/components/admin/ui';
import { StatusBadge, ScorePill } from '@/components/admin/bits';
import { DemoContentPanel } from '@/components/admin/demo-panel';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const user = await requireUser();
  const s = await getSettings();

  const [
    [counts],
    recent,
    activeCampaigns,
    [queue],
    providerRows,
    recentLogs,
    [scoreRow],
  ] = await Promise.all([
    db
      .select({
        published: sql<number>`COALESCE(SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END), 0)::int`,
        drafts: sql<number>`COALESCE(SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END), 0)::int`,
        scheduled: sql<number>`COALESCE(SUM(CASE WHEN status = 'scheduled' THEN 1 ELSE 0 END), 0)::int`,
        total: sql<number>`COUNT(*)::int`,
        words: sql<number>`COALESCE(SUM(word_count), 0)::int`,
        last7: sql<number>`COALESCE(SUM(CASE WHEN published_at >= ${new Date(Date.now() - 7 * 86_400_000)} THEN 1 ELSE 0 END), 0)::int`,
      })
      .from(posts),
    db
      .select({
        id: posts.id,
        title: posts.title,
        slug: posts.slug,
        status: posts.status,
        seoScore: posts.seoScore,
        publishedAt: posts.publishedAt,
        createdAt: posts.createdAt,
        wordCount: posts.wordCount,
      })
      .from(posts)
      .orderBy(desc(posts.createdAt))
      .limit(6),
    db.select().from(campaigns).where(eq(campaigns.status, 'active')).orderBy(campaigns.nextRunAt).limit(5),
    db
      .select({
        pending: sql<number>`COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0)::int`,
        running: sql<number>`COALESCE(SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END), 0)::int`,
        failed: sql<number>`COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0)::int`,
      })
      .from(jobs),
    db.select().from(providers).where(eq(providers.enabled, true)),
    db.select().from(logs).orderBy(desc(logs.id)).limit(6),
    db
      .select({ avg: sql<number>`COALESCE(AVG(seo_score), 0)::float` })
      .from(posts)
      .where(eq(posts.status, 'published')),
  ]);

  const [keywordCount] = await db
    .select({ n: sql<number>`COUNT(*)::int` })
    .from(keywords)
    .where(inArray(keywords.status, ['new', 'queued']));

  const hasText = providerRows.some((p) => p.kind === 'text');
  const hasImage = providerRows.some((p) => p.kind === 'image');
  const liveUrl = (s['site.url'] || '').replace(/\/+$/, '');
  const urlSet = !!liveUrl && !liveUrl.includes('localhost');
  const busy = Number(queue.pending) + Number(queue.running) > 0;

  const checklist = [
    { done: hasText, label: 'Add a free AI text provider', href: '/admin/providers', why: 'Nothing can be written without one. Google Gemini takes two minutes.' },
    { done: hasImage, label: 'Image generation ready', href: '/admin/providers', why: 'Pollinations is pre-installed and needs no key.' },
    { done: Number(keywordCount.n) > 0, label: 'Research some keywords', href: '/admin/keywords', why: 'Campaigns pull from this pool when their list runs dry.' },
    { done: activeCampaigns.length > 0, label: 'Start a campaign', href: '/admin/campaigns', why: 'This is what puts publishing on a schedule.' },
    { done: urlSet, label: 'Set your public site URL', href: '/admin/settings', why: 'Canonical URLs, the sitemap and schema all depend on it.' },
    { done: !!s['verify.google'] || !!s['gsc.clientEmail'], label: 'Connect Search Console', href: '/admin/settings', why: 'Required for indexing checks and auto-fixes.' },
    { done: isOn(s['adsense.enabled']) && !!s['adsense.client'], label: 'Connect AdSense', href: '/admin/settings', why: 'Optional — set it up once you have 15–20 solid articles.' },
  ];
  const remaining = checklist.filter((c) => !c.done);

  return (
    <div className="space-y-6">
      <AutoRefresh enabled={busy} seconds={6} />

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Welcome back, {user.name.split(' ')[0]}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {Number(counts.last7)} article{Number(counts.last7) === 1 ? '' : 's'} published in the last 7 days
            {busy && ' · work in progress'}
          </p>
        </div>
        <div className="flex gap-2">
          <form action={runTickAction}>
            <SubmitButton className="btn btn-ghost" pendingLabel="Running…">
              Run scheduler now
            </SubmitButton>
          </form>
          <Link href="/admin/posts/new" className="btn btn-primary">
            Generate article
          </Link>
        </div>
      </header>

      {/* ------------------------------------------------------- stat row */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Published" value={Number(counts.published) || 0} href="/admin/posts?status=published" />
        <Stat label="Drafts" value={Number(counts.drafts) || 0} href="/admin/posts?status=draft" />
        <Stat label="Scheduled" value={Number(counts.scheduled) || 0} href="/admin/posts?status=scheduled" />
        <Stat
          label="Average SEO score"
          value={Math.round(Number(scoreRow?.avg) || 0)}
          suffix="/100"
          href="/admin/seo"
        />
      </div>

      {/* ------------------------------------------------------ checklist */}
      {remaining.length > 0 && (
        <section className="card p-5">
          <h2 className="text-sm font-semibold text-slate-900">Finish setting up</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {checklist.length - remaining.length} of {checklist.length} done
          </p>
          <ul className="mt-4 space-y-2.5">
            {checklist.map((c) => (
              <li key={c.label} className="flex items-start gap-3">
                <span
                  aria-hidden
                  className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold ${
                    c.done ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  {c.done ? '✓' : '○'}
                </span>
                <span className="min-w-0">
                  <Link
                    href={c.href}
                    className={`text-sm font-medium ${c.done ? 'text-slate-400 line-through' : 'text-slate-800 hover:underline'}`}
                  >
                    {c.label}
                  </Link>
                  {!c.done && <span className="block text-xs text-slate-500">{c.why}</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* --------------------------------------------------- recent posts */}
        <section className="card lg:col-span-2">
          <div className="flex items-center justify-between px-5 py-3.5">
            <h2 className="text-sm font-semibold text-slate-900">Recent articles</h2>
            <Link href="/admin/posts" className="text-xs font-medium text-blue-600 hover:underline">
              All posts →
            </Link>
          </div>
          <div className="table-wrap border-t border-slate-200">
            {recent.length === 0 ? (
              <div className="px-5 py-6">
                <DemoContentPanel />
              </div>
            ) : (
              <table className="data">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Status</th>
                    <th>SEO</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((p) => (
                    <tr key={p.id}>
                      <td className="max-w-xs">
                        <Link href={`/admin/posts/${p.id}`} className="font-medium text-slate-800 hover:underline">
                          {p.title}
                        </Link>
                        <span className="block text-xs text-slate-500">{p.wordCount.toLocaleString()} words</span>
                      </td>
                      <td>
                        <StatusBadge status={p.status} />
                      </td>
                      <td>
                        <ScorePill score={p.seoScore} />
                      </td>
                      <td className="whitespace-nowrap text-xs text-slate-500">{timeAgo(p.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {/* ------------------------------------------------------- sidebar */}
        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="text-sm font-semibold text-slate-900">Queue</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <Row label="Pending" value={Number(queue.pending) || 0} />
              <Row label="Running" value={Number(queue.running) || 0} />
              <Row label="Failed" value={Number(queue.failed) || 0} tone={Number(queue.failed) ? 'bad' : undefined} />
              <Row label="Keywords ready" value={Number(keywordCount.n) || 0} />
            </dl>
            <Link href="/admin/activity" className="mt-4 inline-block text-xs font-medium text-blue-600 hover:underline">
              Activity log →
            </Link>
          </section>

          <section className="card p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">Active campaigns</h2>
              <Link href="/admin/campaigns" className="text-xs font-medium text-blue-600 hover:underline">
                All →
              </Link>
            </div>
            {activeCampaigns.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">
                None running.{' '}
                <Link href="/admin/campaigns/new" className="font-medium text-blue-600 hover:underline">
                  Create one
                </Link>
                .
              </p>
            ) : (
              <ul className="mt-3 space-y-3">
                {activeCampaigns.map((c) => (
                  <li key={c.id}>
                    <Link href={`/admin/campaigns/${c.id}`} className="text-sm font-medium text-slate-800 hover:underline">
                      {c.name}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {c.generatedCount} generated · next run {c.nextRunAt ? timeAgo(c.nextRunAt) : 'unscheduled'}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card p-5">
            <h2 className="text-sm font-semibold text-slate-900">Latest activity</h2>
            {recentLogs.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">Nothing logged yet.</p>
            ) : (
              <ul className="mt-3 space-y-2.5">
                {recentLogs.map((l) => (
                  <li key={l.id} className="text-xs">
                    <span
                      className={`badge ${
                        l.level === 'error' ? 'badge-bad' : l.level === 'warn' ? 'badge-warn' : 'badge-mute'
                      }`}
                    >
                      {l.scope}
                    </span>
                    <span className="ml-2 text-slate-600">{l.message}</span>
                    <span className="block text-[11px] text-slate-400">{timeAgo(l.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- fragments */

function Stat({ label, value, suffix, href }: { label: string; value: number; suffix?: string; href: string }) {
  return (
    <Link href={href} className="card p-4 transition hover:border-slate-300 hover:shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
        {value.toLocaleString()}
        {suffix && <span className="text-base font-medium text-slate-400">{suffix}</span>}
      </p>
    </Link>
  );
}

function Row({ label, value, tone }: { label: string; value: number; tone?: 'bad' }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-slate-600">{label}</dt>
      <dd className={`font-semibold tabular-nums ${tone === 'bad' ? 'text-red-600' : 'text-slate-900'}`}>{value}</dd>
    </div>
  );
}
