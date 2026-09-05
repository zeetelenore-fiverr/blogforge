import Link from 'next/link';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db, posts, providers } from '@/db';
import { requireUser } from '@/lib/auth';
import { getSettings, isOn } from '@/lib/settings';
import { json, timeAgo } from '@/lib/util';
import { fixableIssues } from '@/engine/policy-fix';
import type { PolicyIssue } from '@/engine/adsense-policy';
import { PageHeader, StatusBadge, EmptyState, PolicyBadge } from '@/components/admin/bits';
import { ActionForm, SubmitButton } from '@/components/admin/ui';
import { StackedBar, STATUS } from '@/components/admin/charts';
import { policyCheckAction, policyCheckAllAction, policyFixAction, policyFixAllAction } from '../actions';

export const dynamic = 'force-dynamic';

const SEVERITY_TONE: Record<string, string> = {
  blocker: 'badge-bad',
  warning: 'badge-warn',
  note: 'badge-mute',
};

export default async function PolicyPage() {
  await requireUser();
  const s = await getSettings();

  const rows = await db
    .select({
      id: posts.id,
      title: posts.title,
      slug: posts.slug,
      status: posts.status,
      policyStatus: posts.policyStatus,
      policyIssues: posts.policyIssues,
      policyCheckedAt: posts.policyCheckedAt,
      wordCount: posts.wordCount,
    })
    .from(posts)
    .orderBy(
      // Riskiest first: fail, then review, then everything else.
      sql`CASE ${posts.policyStatus} WHEN 'fail' THEN 0 WHEN 'review' THEN 1 WHEN 'unchecked' THEN 2 ELSE 3 END`,
      desc(posts.createdAt),
    )
    .limit(200);

  const counts = {
    pass: rows.filter((r) => r.policyStatus === 'pass').length,
    review: rows.filter((r) => r.policyStatus === 'review').length,
    fail: rows.filter((r) => r.policyStatus === 'fail').length,
    unchecked: rows.filter((r) => r.policyStatus === 'unchecked').length,
  };

  const textProviders = await db
    .select({ id: providers.id })
    .from(providers)
    .where(and(eq(providers.kind, 'text'), eq(providers.enabled, true)));
  const hasTextProvider = textProviders.length > 0;

  // Which policy families come up most often across the whole site.
  const tally = new Map<string, { policy: string; title: string; n: number; severity: string }>();
  for (const r of rows) {
    for (const i of json<PolicyIssue[]>(r.policyIssues, [])) {
      const hit = tally.get(i.id);
      if (hit) hit.n++;
      else tally.set(i.id, { policy: i.policy, title: i.title, n: 1, severity: i.severity });
    }
  }
  const common = [...tally.values()].sort((a, b) => b.n - a.n).slice(0, 8);
  const flagged = rows.filter((r) => r.policyStatus === 'fail' || r.policyStatus === 'review');
  // Only offer the bulk button when something is genuinely actionable — without
  // a text provider the content rewrites cannot run, and a button that always
  // reports "nothing could be fixed" is worse than no button.
  const flaggedCount = flagged.filter(
    (r) => fixableIssues(json<PolicyIssue[]>(r.policyIssues, []), hasTextProvider).length > 0,
  ).length;

  return (
    <div>
      <PageHeader
        title="AdSense policy"
        description="Every article is screened against Google's programme policies as it is written. This is a screening tool — Google reviews by hand, and nothing here guarantees approval."
      >
        <form action={policyCheckAllAction}>
          <SubmitButton className="btn btn-ghost" pendingLabel="Queueing…">
            Re-check everything
          </SubmitButton>
        </form>
        {flaggedCount > 0 && (
          <form action={policyFixAllAction}>
            <SubmitButton className="btn btn-primary" pendingLabel="Queueing…">
              Fix all {flaggedCount} article{flaggedCount === 1 ? '' : 's'}
            </SubmitButton>
          </form>
        )}
      </PageHeader>

      {!isOn(s['policy.enabled']) && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Policy screening is switched off. Turn it on in{' '}
          <Link href="/admin/settings" className="font-semibold underline">
            Settings → AdSense
          </Link>
          .
        </div>
      )}

      <section className="card mb-6 p-5">
        <h2 className="mb-4 text-sm font-semibold text-slate-900">Across {rows.length} articles</h2>
        <StackedBar
          segments={[
            { label: 'Clear', value: counts.pass, color: STATUS.good },
            { label: 'Needs review', value: counts.review, color: STATUS.warning },
            { label: 'Policy risk', value: counts.fail, color: STATUS.critical },
            { label: 'Not checked', value: counts.unchecked, color: STATUS.neutral },
          ]}
        />
        <p className="mt-3 text-xs text-slate-500">
          <strong className="text-slate-700">Fix issues</strong> adds the missing disclaimers, drops
          repeated sentences and de-clickbaits titles on its own; expanding a thin page or rewriting a
          non-compliant passage needs a text provider
          {hasTextProvider ? ' (you have one configured)' : ' — none is configured yet'}. Nothing is
          deleted wholesale, and every article is re-screened afterwards.
        </p>
        <p className="mt-2 text-xs text-slate-500">
          {isOn(s['policy.blockPublish'])
            ? 'Articles with a blocking issue are held back as drafts instead of publishing.'
            : 'Publishing is not gated — articles go live regardless of their verdict. Enable the gate in Settings → AdSense.'}
        </p>
      </section>

      {common.length > 0 && (
        <section className="card mb-6 p-5">
          <h2 className="text-sm font-semibold text-slate-900">Most common findings</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {common.map((c) => (
              <li key={c.title} className="flex items-start gap-2 text-xs">
                <span className={`badge ${SEVERITY_TONE[c.severity] || 'badge-mute'}`}>{c.n}</span>
                <span>
                  <span className="font-medium text-slate-800">{c.title}</span>
                  <span className="block text-slate-500">{c.policy}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <h2 className="mb-3 text-base font-semibold text-slate-900">
        {flagged.length > 0 ? `${flagged.length} article${flagged.length === 1 ? '' : 's'} to look at` : 'Every article'}
      </h2>

      {rows.length === 0 ? (
        <EmptyState title="Nothing to screen" body="Generate an article first." actionLabel="Generate article" actionHref="/admin/posts/new" />
      ) : (
        <div className="space-y-3">
          {(flagged.length > 0 ? flagged : rows.slice(0, 25)).map((r) => {
            const issues = json<PolicyIssue[]>(r.policyIssues, []);
            const fixable = fixableIssues(issues, hasTextProvider);
            return (
              <article key={r.id} className="card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/admin/posts/${r.id}`} className="font-medium text-slate-900 hover:underline">
                        {r.title}
                      </Link>
                      <PolicyBadge status={r.policyStatus} />
                      <StatusBadge status={r.status} />
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {r.wordCount.toLocaleString()} words ·{' '}
                      {r.policyCheckedAt ? `checked ${timeAgo(r.policyCheckedAt)}` : 'never checked'}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {fixable.length > 0 && (
                      <ActionForm action={policyFixAction}>
                        <input type="hidden" name="id" value={r.id} />
                        <SubmitButton
                          className="btn btn-primary btn-sm"
                          pendingLabel="Fixing… this can take a minute"
                        >
                          Fix {fixable.length} issue{fixable.length === 1 ? '' : 's'}
                        </SubmitButton>
                      </ActionForm>
                    )}
                    <ActionForm action={policyCheckAction}>
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="useAi" value={isOn(s['policy.aiReview']) ? 'on' : ''} />
                      <SubmitButton className="btn btn-ghost btn-sm" pendingLabel="Checking…">
                        Re-check
                      </SubmitButton>
                    </ActionForm>
                  </div>
                </div>

                {issues.length > 0 && (
                  <ul className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                    {issues.map((i) => (
                      <li key={i.id} className="flex items-start gap-2 text-xs">
                        <span className={`badge ${SEVERITY_TONE[i.severity] || 'badge-mute'}`}>{i.severity}</span>
                        <span className="min-w-0">
                          <span className="font-medium text-slate-800">{i.title}</span>
                          <span className="ml-1.5 text-slate-400">· {i.policy}</span>
                          <span className="block text-slate-600">{i.detail}</span>
                          <span className="block text-slate-500">→ {i.remedy}</span>
                          {i.evidence && i.evidence.length > 0 && (
                            <span className="mt-0.5 block text-[11px] text-slate-400">
                              Matched: {i.evidence.join(', ')}
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
