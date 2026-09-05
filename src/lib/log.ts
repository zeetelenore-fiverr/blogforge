import 'server-only';
import { db, logs } from '@/db';
import { lt } from 'drizzle-orm';

type Level = 'debug' | 'info' | 'warn' | 'error';

/**
 * Writes to the activity log the admin sees. Never throws: a logging failure
 * must not take down a generation run.
 */
export async function log(level: Level, scope: string, message: string, meta: unknown = {}) {
  try {
    await db.insert(logs).values({
      level,
      scope,
      message: String(message).slice(0, 2000),
      meta: JSON.stringify(meta ?? {}).slice(0, 8000),
    });
  } catch (err) {
    console.error('[blogforge] log write failed', err);
  }
  if (level === 'error') console.error(`[${scope}] ${message}`);
}

export const logInfo = (scope: string, m: string, meta?: unknown) => log('info', scope, m, meta);
export const logWarn = (scope: string, m: string, meta?: unknown) => log('warn', scope, m, meta);
export const logError = (scope: string, m: string, meta?: unknown) => log('error', scope, m, meta);
export const logDebug = (scope: string, m: string, meta?: unknown) => log('debug', scope, m, meta);

/** Keep the log table from growing without bound on a long-running install. */
export async function pruneLogs(days = 30) {
  const cutoff = new Date(Date.now() - days * 86_400_000);
  await db.delete(logs).where(lt(logs.createdAt, cutoff));
}

export function errMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}
