import Link from 'next/link';
import { desc, sql } from 'drizzle-orm';
import { db, jobs, logs } from '@/db';
import { requireUser } from '@/lib/auth';
import { json, timeAgo } from '@/lib/util';
import { PageHeader, StatusBadge } from '@/components/admin/bits';
import { SubmitButton, ConfirmButton, AutoRefresh } from '@/components/admin/ui';
import { runTickAction, runJobNowAction, cancelJobAction, retryJobAction, clearLogsAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function ActivityPage() {
  await requireUser();

  const [jobRows, logRows, [counts]] = await Promise.all([
    db.select().from(jobs).orderBy(desc(jobs.id)).limit(60),
    db.select().from(logs).orderBy(desc(logs.id)).limit(120),
    db
      .select({
        pending: sql<number>`COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0)::int`,
        running: sql<number>`COALESCE(SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END), 0)::int`,
        failed: sql<number>`COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0)::int`,
        done: sql<number>`COALESCE(SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END), 0)::int`,
      })
      .from(jobs),
  ]);

  const busy = Number(counts.pending) + Number(counts.running) > 0;
  const inlineScheduler = process.env.INLINE_SCHEDULER === '1';

  return (
    <div>
      <AutoRefresh enabled={busy} seconds={6} />

      <PageHeader title="Activity" description="The job queue and everything the engine has logged.">
        <form action={runTickAction}>
          <SubmitButton className="btn btn-primary" pendingLabel="Running…">
            Run scheduler now
          </SubmitButton>
        </form>
      </PageHeader>

      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        <Stat label="Pending" value={Number(counts.pending) || 0} />
        <Stat label="Running" value={Number(counts.running) || 0} />
        <Stat label="Completed" value={Number(counts.done) || 0} />
        <Stat label="Failed" value={Number(counts.failed) || 0} tone={Number(counts.failed) ? 'bad' : undefined} />
      </div>

      <div
        className={`mb-6 rounded-lg border px-4 py-3 text-sm ${
          inlineScheduler ? 'border-green-200 bg-green-50 text-green-900' : 'border-amber-200 bg-amber-50 text-amber-900'
        }`}
      >
        {inlineScheduler ? (
          <>
            <span className="font-semibold">In-process scheduler is running.</span> It ticks every 60 seconds inside
            this Next.js server — right for a VPS, Docker or local development.
          </>
        ) : (
          <>
            <span className="font-semibold">In-process scheduler is off.</span> Drive{' '}
            <code className="rounded bg-white/60 px-1">/api/cron/tick</code> from Vercel Cron or any free cron service,
            or set <code className="rounded bg-white/60 px-1">INLINE_SCHEDULER=1</code> and restart.
          </>
        )}
      </div>

      <section className="mb-8">
        <h2 className="mb-3 text-base font-semibold text-slate-900">Job queue</h2>
        {jobRows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
            No jobs yet.
          </p>
        ) : (
          <div className="card table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Status</th>
                  <th>Detail</th>
                  <th>When</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {jobRows.map((j) => {
                  const payload = json<Record<string, unknown>>(j.payload, {});
                  const result = json<Record<string, unknown>>(j.result, {});
                  return (
                    <tr key={j.id}>
                      <td>
                        <span className="font-medium text-slate-800">{j.type.replace('_', ' ')}</span>
                        <span className="block text-xs text-slate-500">#{j.id}</span>
                      </td>
                      <td>
                        <StatusBadge status={j.status} />
                        {j.attempts > 1 && (
                          <span className="block text-[11px] text-slate-500">attempt {j.attempts}</span>
                        )}
                      </td>
                      <td className="max-w-md">
                        {typeof payload.keyword === 'string' && (
                          <span className="block text-xs text-slate-600">⌕ {payload.keyword}</span>
                        )}
                        {j.progress && <span className="block text-xs text-slate-500">{j.progress}</span>}
                        {typeof result.title === 'string' && (
                          <Link
                            href={`/admin/posts/${result.postId}`}
                            className="block truncate text-xs text-blue-600 hover:underline"
                          >
                            {result.title}
                          </Link>
                        )}
                        {j.error && <span className="block break-words text-xs text-red-600">{j.error}</span>}
                      </td>
                      <td className="whitespace-nowrap text-xs text-slate-500">
                        {timeAgo(j.finishedAt || j.startedAt || j.runAt)}
                      </td>
                      <td>
                        <div className="flex gap-1">
                          {j.status === 'pending' && (
                            <>
                              <form action={runJobNowAction}>
                                <input type="hidden" name="id" value={j.id} />
                                <SubmitButton className="btn btn-ghost btn-sm" pendingLabel="…">
                                  Run
                                </SubmitButton>
                              </form>
                              <form action={cancelJobAction}>
                                <input type="hidden" name="id" value={j.id} />
                                <button className="btn btn-ghost btn-sm">Cancel</button>
                              </form>
                            </>
                          )}
                          {j.status === 'failed' && (
                            <form action={retryJobAction}>
                              <input type="hidden" name="id" value={j.id} />
                              <SubmitButton className="btn btn-ghost btn-sm" pendingLabel="…">
                                Retry
                              </SubmitButton>
                            </form>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Log</h2>
          <form action={clearLogsAction}>
            <ConfirmButton message="Clear the entire activity log?">Clear log</ConfirmButton>
          </form>
        </div>

        {logRows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
            Nothing logged yet.
          </p>
        ) : (
          <ul className="card divide-y divide-slate-100">
            {logRows.map((l) => (
              <li key={l.id} className="flex flex-wrap items-start gap-3 px-4 py-2.5">
                <span
                  className={`badge ${
                    l.level === 'error'
                      ? 'badge-bad'
                      : l.level === 'warn'
                        ? 'badge-warn'
                        : l.level === 'debug'
                          ? 'badge-mute'
                          : 'badge-info'
                  }`}
                >
                  {l.level}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="text-sm text-slate-800">{l.message}</span>
                  <span className="block text-xs text-slate-500">
                    {l.scope} · {timeAgo(l.createdAt)}
                  </span>
                  {l.meta !== '{}' && (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-[11px] text-slate-400">details</summary>
                      <pre className="mt-1 max-h-40 overflow-auto rounded bg-slate-50 p-2 text-[11px] text-slate-600">
                        {JSON.stringify(json(l.meta, {}), null, 2)}
                      </pre>
                    </details>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'bad' }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${tone === 'bad' ? 'text-red-600' : 'text-slate-900'}`}>
        {value}
      </p>
    </div>
  );
}
