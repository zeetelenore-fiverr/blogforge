import { asc } from 'drizzle-orm';
import { db, providers } from '@/db';
import { requireUser } from '@/lib/auth';
import { json, timeAgo } from '@/lib/util';
import { CATALOG, byKind, type ProviderKind } from '@/providers/catalog';
import { PageHeader, StatusBadge } from '@/components/admin/bits';
import { ActionForm, SubmitButton, ConfirmButton } from '@/components/admin/ui';
import {
  AddProviderPanel, EditProviderPanel, KindHeader, type ExistingProvider,
} from '@/components/admin/provider-form';
import { testProviderAction, deleteProviderAction, toggleProviderAction } from '../actions';

export const dynamic = 'force-dynamic';

const KINDS: ProviderKind[] = ['text', 'image', 'keyword', 'seo'];

export default async function ProvidersPage() {
  await requireUser();
  const rows = await db.select().from(providers).orderBy(asc(providers.kind), asc(providers.priority));

  return (
    <div>
      <PageHeader
        title="AI providers"
        description="Every service below has a free tier. Add more than one per category — BlogForge rotates through them in priority order and skips anything that is rate-limited or over its cap."
      />

      <div className="space-y-10">
        {KINDS.map((kind) => {
          const mine = rows.filter((r) => r.kind === kind);
          const catalog = byKind(kind);

          return (
            <section key={kind}>
              <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                <KindHeader kind={kind} />
                <AddProviderPanel catalog={catalog} kind={kind} />
              </div>

              {mine.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
                  Nothing configured yet.
                </div>
              ) : (
                <ul className="space-y-3">
                  {mine.map((p) => {
                    const entry = CATALOG.find((c) => c.id === p.providerId);
                    const existing: ExistingProvider = {
                      id: p.id,
                      kind: p.kind,
                      providerId: p.providerId,
                      label: p.label,
                      model: p.model,
                      priority: p.priority,
                      dailyLimit: p.dailyLimit,
                      enabled: p.enabled,
                      extra: json<Record<string, string>>(p.extra, {}),
                      hasKey: !!p.apiKey,
                    };

                    return (
                      <li key={p.id} className="card p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-semibold text-slate-900">{p.label}</p>
                              <StatusBadge status={p.enabled ? p.status : 'paused'} />
                              {entry?.noAccount && <span className="badge badge-info">free, no key</span>}
                              {p.priority <= 10 && <span className="badge badge-mute">primary</span>}
                            </div>
                            <p className="mt-1 text-xs text-slate-500">
                              {p.model && <code className="rounded bg-slate-100 px-1 py-0.5">{p.model}</code>}
                              {p.model && ' · '}
                              priority {p.priority}
                              {p.dailyLimit > 0 && ` · ${p.usedToday}/${p.dailyLimit} today`}
                              {p.totalCalls > 0 && ` · ${p.totalCalls.toLocaleString()} calls`}
                              {p.lastCheckedAt && ` · checked ${timeAgo(p.lastCheckedAt)}`}
                            </p>
                            {p.lastError && (
                              <p className="mt-1.5 max-w-xl break-words rounded bg-red-50 px-2 py-1 text-xs text-red-700">
                                {p.lastError}
                              </p>
                            )}
                            {p.cooldownUntil && p.cooldownUntil.getTime() > Date.now() && (
                              <p className="mt-1.5 text-xs text-amber-700">
                                Cooling down until {p.cooldownUntil.toLocaleTimeString()} after a rate limit.
                              </p>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <ActionForm action={testProviderAction} className="contents">
                              <input type="hidden" name="id" value={p.id} />
                              <SubmitButton className="btn btn-ghost btn-sm" pendingLabel="Testing…">
                                Test
                              </SubmitButton>
                            </ActionForm>
                            <form action={toggleProviderAction}>
                              <input type="hidden" name="id" value={p.id} />
                              <button className="btn btn-ghost btn-sm">{p.enabled ? 'Disable' : 'Enable'}</button>
                            </form>
                            <EditProviderPanel catalog={byKind(kind)} provider={existing} />
                            <form action={deleteProviderAction}>
                              <input type="hidden" name="id" value={p.id} />
                              <ConfirmButton message={`Remove ${p.label}?`}>Remove</ConfirmButton>
                            </form>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      {/* ------------------------------------------------ catalog reference */}
      <section className="mt-12">
        <h2 className="text-base font-semibold text-slate-900">Where to get free keys</h2>
        <p className="mt-1 text-sm text-slate-500">
          Free tiers change often. These are the services BlogForge speaks natively — the notes are a starting
          point, not a guarantee.
        </p>
        <div className="mt-4 table-wrap card">
          <table className="data">
            <thead>
              <tr>
                <th>Service</th>
                <th>Use</th>
                <th>Free tier</th>
                <th>Sign up</th>
              </tr>
            </thead>
            <tbody>
              {CATALOG.map((c) => (
                <tr key={`${c.kind}-${c.id}`}>
                  <td className="font-medium text-slate-800">
                    {c.name}
                    {c.recommended && <span className="badge badge-good ml-2">pick me</span>}
                  </td>
                  <td className="text-slate-600">{c.kind}</td>
                  <td className="max-w-md text-slate-600">{c.freeTier}</td>
                  <td>
                    {c.signupUrl ? (
                      <a
                        href={c.signupUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-blue-600 hover:underline"
                      >
                        Open ↗
                      </a>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
