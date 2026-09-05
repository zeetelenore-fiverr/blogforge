import 'server-only';
import { and, asc, eq, sql } from 'drizzle-orm';
import { db, providers, type Provider } from '@/db';
import { decrypt } from '@/lib/crypto';
import { logWarn, logInfo, errMessage } from '@/lib/log';
import { json } from '@/lib/util';
import { byId, type ProviderKind } from './catalog';
import { callText, ProviderError, type TextRequest } from './text';
import { callImage, type ImageRequest } from './image';
import { callKeywords } from './keywords';
import type { RuntimeProvider, ImageResult, KeywordSuggestion } from './types';

export * from './types';
export { CATALOG, byId, byKind } from './catalog';
export type { TextRequest } from './text';
export type { ImageRequest } from './image';
export { ProviderError } from './text';

function toRuntime(row: Provider): RuntimeProvider {
  const entry = byId(row.providerId);
  return {
    rowId: row.id,
    providerId: row.providerId,
    adapter: entry?.adapter || row.providerId,
    label: row.label,
    apiKey: decrypt(row.apiKey),
    model: row.model || entry?.defaultModel || '',
    extra: json<Record<string, string>>(row.extra, {}),
  };
}

/**
 * Healthy providers of a kind, best first. A provider in cooldown (usually a
 * 429) or over its configured daily limit drops to the back rather than out —
 * on a free-tier-only install, a degraded provider still beats no provider.
 */
export async function pickProviders(kind: ProviderKind, pinnedId?: number | null): Promise<RuntimeProvider[]> {
  const rows = await db
    .select()
    .from(providers)
    .where(and(eq(providers.kind, kind), eq(providers.enabled, true)))
    .orderBy(asc(providers.priority), asc(providers.id));

  const now = Date.now();
  const usable: Provider[] = [];
  const deferred: Provider[] = [];

  for (const r of rows) {
    const cooling = r.cooldownUntil ? r.cooldownUntil.getTime() > now : false;
    const overQuota = r.dailyLimit > 0 && r.usedToday >= r.dailyLimit && !isNewDay(r);
    (cooling || overQuota ? deferred : usable).push(r);
  }

  let ordered = [...usable, ...deferred];
  if (pinnedId) {
    const pinned = ordered.find((r) => r.id === pinnedId);
    if (pinned) ordered = [pinned, ...ordered.filter((r) => r.id !== pinnedId)];
  }
  return ordered.map(toRuntime);
}

function isNewDay(r: Provider): boolean {
  return !r.quotaResetAt || r.quotaResetAt.getTime() < Date.now();
}

/* ----------------------------------------------------------------- text */

export type TextOutcome = { text: string; provider: RuntimeProvider; attempts: number };

export async function generateText(
  req: TextRequest,
  opts: { pinnedId?: number | null; scope?: string } = {},
): Promise<TextOutcome> {
  const chain = await pickProviders('text', opts.pinnedId);
  if (!chain.length) {
    throw new Error(
      'No text provider is configured. Add a free key under Settings → AI Providers (Google Gemini is a good first one).',
    );
  }

  const errors: string[] = [];
  let attempts = 0;
  for (const p of chain) {
    attempts++;
    const started = Date.now();
    try {
      const text = await callText(p, req);
      await recordSuccess(p.rowId);
      return { text, provider: p, attempts };
    } catch (err) {
      const rateLimited = err instanceof ProviderError && err.rateLimited;
      await recordFailure(p.rowId, errMessage(err), rateLimited);
      errors.push(`${p.label}: ${errMessage(err)}`);
      await logWarn(opts.scope || 'providers', `Text provider ${p.label} failed after ${Date.now() - started}ms`, {
        error: errMessage(err),
        rateLimited,
      });
    }
  }
  throw new Error(`All ${chain.length} text provider(s) failed. ${errors.join(' | ')}`);
}

/** Convenience wrapper that insists on parseable JSON, retrying once. */
export async function generateJson<T>(
  req: TextRequest,
  opts: { pinnedId?: number | null; scope?: string } = {},
): Promise<{ data: T; provider: RuntimeProvider }> {
  const { extractJson } = await import('@/lib/util');
  for (let attempt = 0; attempt < 2; attempt++) {
    const out = await generateText({ ...req, json: true, temperature: attempt ? 0.2 : req.temperature }, opts);
    const data = extractJson<T>(out.text);
    if (data !== null) return { data, provider: out.provider };
    await logWarn(opts.scope || 'providers', 'Model returned unparseable JSON, retrying', {
      sample: out.text.slice(0, 300),
    });
  }
  throw new Error('Model did not return valid JSON after 2 attempts');
}

/* ---------------------------------------------------------------- image */

export async function generateImage(
  req: ImageRequest,
  opts: { pinnedId?: number | null; scope?: string } = {},
): Promise<ImageResult | null> {
  const chain = await pickProviders('image', opts.pinnedId);
  if (!chain.length) return null;

  const errors: string[] = [];
  for (const p of chain) {
    // Free image endpoints rate-limit constantly and recover within seconds, so
    // a short retry is worth more than immediately burning the next provider.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await callImage(p, req);
        await recordSuccess(p.rowId);
        return result;
      } catch (err) {
        const rateLimited = err instanceof ProviderError && err.rateLimited;
        if (rateLimited && attempt === 0) {
          const { sleep } = await import('@/lib/util');
          await sleep(4000);
          continue;
        }
        await recordFailure(p.rowId, errMessage(err), rateLimited);
        errors.push(`${p.label}: ${errMessage(err)}`);
        break;
      }
    }
  }
  await logWarn(opts.scope || 'providers', 'All image providers failed', { errors });
  return null;
}

/* -------------------------------------------------------------- keyword */

export async function researchRaw(seed: string, limitPerProvider = 40): Promise<KeywordSuggestion[]> {
  const chain = (await pickProviders('keyword')).filter((p) => p.adapter !== 'ai-keywords');
  const out: KeywordSuggestion[] = [];
  for (const p of chain) {
    try {
      const rows = await callKeywords(p, seed, limitPerProvider);
      await recordSuccess(p.rowId);
      out.push(...rows);
    } catch (err) {
      await recordFailure(p.rowId, errMessage(err), err instanceof ProviderError && err.rateLimited);
    }
  }
  return out;
}

export async function hasAiKeywordProvider(): Promise<boolean> {
  const chain = await pickProviders('keyword');
  return chain.some((p) => p.adapter === 'ai-keywords');
}

/* ------------------------------------------------------------ bookkeeping */

async function recordSuccess(rowId: number) {
  const resetAt = endOfDay();
  await db
    .update(providers)
    .set({
      status: 'ok',
      lastError: null,
      lastCheckedAt: new Date(),
      cooldownUntil: null,
      totalCalls: sql`${providers.totalCalls} + 1`,
      usedToday: sql`CASE WHEN ${providers.quotaResetAt} IS NULL OR ${providers.quotaResetAt} < NOW()
                         THEN 1 ELSE ${providers.usedToday} + 1 END`,
      quotaResetAt: sql`CASE WHEN ${providers.quotaResetAt} IS NULL OR ${providers.quotaResetAt} < NOW()
                             THEN ${resetAt} ELSE ${providers.quotaResetAt} END`,
    })
    .where(eq(providers.id, rowId));
}

async function recordFailure(rowId: number, message: string, rateLimited: boolean) {
  await db
    .update(providers)
    .set({
      status: rateLimited ? 'rate_limited' : 'error',
      lastError: message.slice(0, 500),
      lastCheckedAt: new Date(),
      // Back off for 15 minutes on a 429 so the chain moves on instead of
      // hammering a provider that has told us to stop.
      cooldownUntil: rateLimited ? new Date(Date.now() + 15 * 60_000) : null,
    })
    .where(eq(providers.id, rowId));
}

function endOfDay(): Date {
  const d = new Date();
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

/* ---------------------------------------------------------- health check */

export async function testProvider(rowId: number): Promise<{ ok: boolean; message: string }> {
  const [row] = await db.select().from(providers).where(eq(providers.id, rowId));
  if (!row) return { ok: false, message: 'Provider not found' };
  const p = toRuntime(row);

  try {
    if (row.kind === 'text') {
      const text = await callText(p, {
        prompt: 'Reply with exactly: OK',
        maxTokens: 16,
        temperature: 0,
      });
      await recordSuccess(rowId);
      return { ok: true, message: `Responded: ${text.trim().slice(0, 60)}` };
    }
    if (row.kind === 'image') {
      const img = await callImage(p, { prompt: 'a simple blue circle on white', width: 512, height: 512, slug: 'health-check' });
      await recordSuccess(rowId);
      return { ok: true, message: `Image generated: ${img.url}` };
    }
    if (row.kind === 'keyword') {
      if (p.adapter === 'ai-keywords') {
        const chain = await pickProviders('text');
        return chain.length
          ? { ok: true, message: `Will use ${chain[0].label} for AI keyword research` }
          : { ok: false, message: 'No text provider configured for AI keyword research' };
      }
      const rows = await callKeywords(p, 'coffee', 5);
      await recordSuccess(rowId);
      return { ok: true, message: `${rows.length} suggestions, e.g. "${rows[0]?.keyword ?? '—'}"` };
    }
    // seo
    const { pageSpeed, googleAccessToken } = await import('./seo');
    if (p.adapter === 'pagespeed') {
      const r = await pageSpeed('https://example.com', p.apiKey);
      await recordSuccess(rowId);
      return { ok: true, message: `PageSpeed reachable (SEO score ${r.seo ?? '—'})` };
    }
    if (p.adapter === 'gsc') {
      await googleAccessToken(p.extra.clientEmail || '', p.apiKey, 'https://www.googleapis.com/auth/webmasters.readonly');
      await recordSuccess(rowId);
      return { ok: true, message: 'Search Console authenticated' };
    }
    if (p.adapter === 'builtin') return { ok: true, message: 'Built-in analyzer is always available' };
    return { ok: true, message: 'No health check for this provider' };
  } catch (err) {
    await recordFailure(rowId, errMessage(err), err instanceof ProviderError && err.rateLimited);
    return { ok: false, message: errMessage(err) };
  }
}

export async function resetDailyQuotas() {
  const changed = await db
    .update(providers)
    .set({ usedToday: 0, quotaResetAt: endOfDay(), cooldownUntil: null })
    .where(sql`${providers.quotaResetAt} IS NULL OR ${providers.quotaResetAt} < NOW()`);
  await logInfo('providers', 'Daily provider quotas reset', { changed: !!changed });
}
