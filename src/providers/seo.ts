import 'server-only';
import crypto from 'node:crypto';
import { fetchWithTimeout } from '@/lib/util';
import { ProviderError, httpError } from './text';

/* --------------------------------------------------- PageSpeed Insights */

export type PageSpeedResult = {
  performance: number | null;
  seo: number | null;
  accessibility: number | null;
  bestPractices: number | null;
  lcp: string;
  cls: string;
  inp: string;
  failedAudits: { id: string; title: string; description: string }[];
};

/** Works without a key (throttled); a free API key raises the quota a lot. */
export async function pageSpeed(
  url: string,
  apiKey = '',
  strategy: 'mobile' | 'desktop' = 'mobile',
): Promise<PageSpeedResult> {
  const params = new URLSearchParams({ url, strategy });
  for (const c of ['performance', 'seo', 'accessibility', 'best-practices']) params.append('category', c);
  if (apiKey) params.set('key', apiKey);

  const res = await fetchWithTimeout(
    `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params}`,
    {},
    120_000,
  );
  if (!res.ok) throw await httpError(res, 'pagespeed');

  type Audit = { id?: string; title?: string; description?: string; score?: number | null; displayValue?: string };
  const data = (await res.json()) as {
    lighthouseResult?: {
      categories?: Record<string, { score?: number | null }>;
      audits?: Record<string, Audit>;
    };
  };
  const cats = data.lighthouseResult?.categories || {};
  const audits = data.lighthouseResult?.audits || {};
  const pct = (v?: number | null) => (typeof v === 'number' ? Math.round(v * 100) : null);

  const failedAudits = Object.entries(audits)
    .filter(([, a]) => typeof a.score === 'number' && (a.score as number) < 0.9)
    .slice(0, 25)
    .map(([id, a]) => ({
      id,
      title: a.title || id,
      description: (a.description || '').replace(/\[[^\]]*\]\([^)]*\)/g, '').slice(0, 300),
    }));

  return {
    performance: pct(cats.performance?.score),
    seo: pct(cats.seo?.score),
    accessibility: pct(cats.accessibility?.score),
    bestPractices: pct(cats['best-practices']?.score),
    lcp: audits['largest-contentful-paint']?.displayValue || '',
    cls: audits['cumulative-layout-shift']?.displayValue || '',
    inp: audits['interaction-to-next-paint']?.displayValue || '',
    failedAudits,
  };
}

/* ------------------------------------------------- Google Search Console */

/**
 * Service-account OAuth without a dependency: build and RS256-sign a JWT with
 * node:crypto, then exchange it for an access token.
 */
export async function googleAccessToken(
  clientEmail: string,
  privateKey: string,
  scope: string,
): Promise<string> {
  const key = privateKey.replace(/\\n/g, '\n').trim();
  if (!key.includes('BEGIN')) throw new ProviderError('Service account private key looks malformed');

  const iat = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(
    JSON.stringify({
      iss: clientEmail,
      scope,
      aud: 'https://oauth2.googleapis.com/token',
      exp: iat + 3600,
      iat,
    }),
  );
  const signature = crypto
    .createSign('RSA-SHA256')
    .update(`${header}.${claims}`)
    .sign(key)
    .toString('base64url');

  const res = await fetchWithTimeout('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${claims}.${signature}`,
    }),
  }, 30_000);

  if (!res.ok) throw await httpError(res, 'google-oauth');
  const data = (await res.json()) as { access_token?: string; error_description?: string };
  if (!data.access_token) throw new ProviderError(data.error_description || 'No access token returned');
  return data.access_token;
}

export type InspectionResult = {
  coverageState: string;
  verdict: string;
  robotsTxtState: string;
  indexingState: string;
  lastCrawlTime: string;
  pageFetchState: string;
  crawledAs: string;
  referringUrls: string[];
  richResults: string;
  mobileVerdict: string;
  raw: unknown;
};

/** URL Inspection API — the same data the "URL is not on Google" panel shows. */
export async function inspectUrl(
  token: string,
  siteUrl: string,
  inspectionUrl: string,
): Promise<InspectionResult> {
  const res = await fetchWithTimeout(
    'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ inspectionUrl, siteUrl, languageCode: 'en-US' }),
    },
    60_000,
  );
  if (!res.ok) throw await httpError(res, 'gsc-inspect');

  const data = (await res.json()) as {
    inspectionResult?: {
      indexStatusResult?: Record<string, unknown> & { referringUrls?: string[] };
      richResultsResult?: { verdict?: string };
      mobileUsabilityResult?: { verdict?: string };
    };
  };
  const i = data.inspectionResult?.indexStatusResult || {};
  const str = (k: string) => String((i as Record<string, unknown>)[k] ?? '');

  return {
    coverageState: str('coverageState') || 'unknown',
    verdict: str('verdict') || 'unknown',
    robotsTxtState: str('robotsTxtState'),
    indexingState: str('indexingState'),
    lastCrawlTime: str('lastCrawlTime'),
    pageFetchState: str('pageFetchState'),
    crawledAs: str('crawledAs'),
    referringUrls: (i.referringUrls as string[]) || [],
    richResults: data.inspectionResult?.richResultsResult?.verdict || '',
    mobileVerdict: data.inspectionResult?.mobileUsabilityResult?.verdict || '',
    raw: data,
  };
}

export type SearchAnalyticsRow = {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export async function searchAnalytics(
  token: string,
  siteUrl: string,
  opts: { startDate: string; endDate: string; dimensions?: string[]; rowLimit?: number },
): Promise<SearchAnalyticsRow[]> {
  const res = await fetchWithTimeout(
    `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({
        startDate: opts.startDate,
        endDate: opts.endDate,
        dimensions: opts.dimensions ?? ['query'],
        rowLimit: opts.rowLimit ?? 100,
      }),
    },
    60_000,
  );
  if (!res.ok) throw await httpError(res, 'gsc-analytics');
  const data = (await res.json()) as { rows?: SearchAnalyticsRow[] };
  return data.rows || [];
}

/** Ping GSC that the sitemap changed. Cheap, and it does help discovery. */
export async function submitSitemap(token: string, siteUrl: string, sitemapUrl: string): Promise<void> {
  const res = await fetchWithTimeout(
    `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/sitemaps/${encodeURIComponent(sitemapUrl)}`,
    { method: 'PUT', headers: { authorization: `Bearer ${token}` } },
    30_000,
  );
  if (!res.ok && res.status !== 204) throw await httpError(res, 'gsc-sitemap');
}

/* ------------------------------------------------------------ IndexNow */

/**
 * IndexNow is free and keyless in the sense that *you* generate the key and
 * host it at /<key>.txt — which BlogForge does automatically. Bing, Yandex,
 * Seznam and Naver consume it.
 */
export async function indexNowSubmit(
  host: string,
  key: string,
  urls: string[],
  keyLocation = `https://${host}/indexnow/${key}.txt`,
): Promise<{ ok: boolean; status: number; message: string }> {
  const res = await fetchWithTimeout('https://api.indexnow.org/IndexNow', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      host,
      key,
      keyLocation,
      urlList: urls.slice(0, 10_000),
    }),
  }, 30_000);
  const message = await res.text().catch(() => '');
  return { ok: res.ok, status: res.status, message: message.slice(0, 200) };
}

/* ------------------------------------------------- Bing Webmaster Tools */

export async function bingSubmitUrls(apiKey: string, siteUrl: string, urls: string[]) {
  const res = await fetchWithTimeout(
    `https://ssl.bing.com/webmaster/api.svc/json/SubmitUrlbatch?apikey=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ siteUrl, urlList: urls }),
    },
    30_000,
  );
  if (!res.ok) throw await httpError(res, 'bing');
  return res.json();
}

const b64url = (s: string) => Buffer.from(s).toString('base64url');
