import { tick } from '@/engine/scheduler';
import { logError } from '@/lib/log';
import { errMessage } from '@/lib/log';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Scheduler entry point for serverless / external cron.
 *
 * Vercel Cron sends an `authorization: Bearer $CRON_SECRET` header; free
 * services like cron-job.org can pass `?secret=` instead. If CRON_SECRET is
 * unset the endpoint is open, which is fine for a local or firewalled install
 * but should be set anywhere public.
 */
async function handle(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const url = new URL(req.url);
    const header = req.headers.get('authorization') || '';
    const provided = header.replace(/^Bearer\s+/i, '') || url.searchParams.get('secret') || '';
    if (provided !== secret) {
      return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const url = new URL(req.url);
    const maxJobs = Math.min(10, Math.max(1, Number(url.searchParams.get('jobs')) || 3));
    const result = await tick({ maxJobs });
    return Response.json({ ok: true, ...result });
  } catch (err) {
    await logError('cron', 'Tick failed', { error: errMessage(err) });
    return Response.json({ ok: false, error: errMessage(err) }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
