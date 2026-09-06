import 'server-only';
import { db, dbReady, settings } from '@/db';
import { sql } from 'drizzle-orm';

/**
 * Every configurable string in the product lives here. Keys are flat so the
 * settings screens can render them generically and new ones cost one line.
 */
export const DEFAULT_SETTINGS = {
  // identity
  'site.name': 'BlogForge',
  'site.tagline': 'Answers, guides and deep dives — published daily.',
  'site.description':
    'An independent publication covering practical guides, comparisons and explainers.',
  'site.url': process.env.SITE_URL || 'http://localhost:3000',
  'site.logoUrl': '',
  'site.faviconUrl': '',
  'site.language': 'en',
  'site.locale': 'en_US',
  'site.timezone': 'UTC',
  'site.postsPerPage': '12',
  'site.copyright': '',

  // look
  'brand.primary': '#18181b', // interactive / buttons
  'brand.accent': '#ec4899',  // single editorial accent
  'brand.font': 'system',
  'brand.homepageLayout': 'magazine', // magazine | list | grid

  // authorship / E-E-A-T
  'org.name': 'BlogForge Media',
  'org.logo': '',
  'org.email': '',
  'org.phone': '',
  'org.address': '',
  'org.foundingDate': '',

  // seo
  'seo.titleTemplate': '%s | %site%',
  'seo.homeTitle': '',
  'seo.metaDescription': '',
  'seo.ogImage': '',
  'seo.twitterHandle': '',
  'seo.noindexSite': '0',
  'seo.autoInternalLinks': '1',
  'seo.breadcrumbs': '1',
  'seo.rssEnabled': '1',

  // verification + scripts (header/footer editor)
  'verify.google': '',
  'verify.bing': '',
  'verify.yandex': '',
  'verify.pinterest': '',
  'scripts.head': '',
  'scripts.bodyStart': '',
  'scripts.bodyEnd': '',

  // analytics
  'analytics.ga4': '',
  'analytics.gtm': '',

  // adsense
  'adsense.enabled': '0',
  'adsense.client': '', // ca-pub-XXXXXXXXXXXXXXXX
  'adsense.autoAds': '1',
  'adsense.slotInArticle': '',
  'adsense.slotSidebar': '',
  'adsense.adsTxt': '',

  // robots / llms
  'robots.custom': '',
  'llms.custom': '',
  'llms.enabled': '1',

  // Google Search Console (service account JSON for URL Inspection API)
  'gsc.siteUrl': '',
  'gsc.clientEmail': '',
  'gsc.privateKey': '',
  'gsc.indexingApi': '0',

  // social
  'social.twitter': '',
  'social.facebook': '',
  'social.linkedin': '',
  'social.youtube': '',
  'social.instagram': '',

  // AdSense policy review
  'policy.enabled': '1',
  'policy.aiReview': '0',
  'policy.blockPublish': '1',

  // automatic indexing checks
  'indexing.autoCheck': '1',
  'indexing.autoFix': '0',
  'indexing.intervalHours': '24',
  'indexing.batchSize': '10',

  // generation defaults
  'gen.defaultPrompt': '',
  'gen.defaultWordCount': '1200',
  'gen.imageStyle': 'clean editorial photograph, natural light, high detail',
  'gen.disclosure': '1', // show "AI-assisted, human-reviewed" notice
  'gen.disclosureText':
    'This article was drafted with AI assistance and reviewed before publication.',
} as const;

export type SettingKey = keyof typeof DEFAULT_SETTINGS;
export type SettingsMap = Record<SettingKey, string> & Record<string, string>;

const cache = globalThis as unknown as { __bf_settings?: SettingsMap; __bf_settings_at?: number };
const TTL = 5_000;

export async function getSettings(force = false): Promise<SettingsMap> {
  if (!force && cache.__bf_settings && Date.now() - (cache.__bf_settings_at || 0) < TTL) {
    return cache.__bf_settings;
  }
  await dbReady();
  const rows = await db.select().from(settings);
  const map = { ...DEFAULT_SETTINGS } as SettingsMap;
  for (const r of rows) if (r.value !== '') (map as Record<string, string>)[r.key] = r.value;
  cache.__bf_settings = map;
  cache.__bf_settings_at = Date.now();
  return map;
}

export async function getSetting(key: string): Promise<string> {
  const all = await getSettings();
  return all[key] ?? '';
}

export async function setSettings(values: Record<string, string>): Promise<void> {
  const entries = Object.entries(values);
  if (!entries.length) return;
  for (const [key, value] of entries) {
    await db
      .insert(settings)
      .values({ key, value: value ?? '', updatedAt: new Date() })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value: sql`excluded.value`, updatedAt: new Date() },
      });
  }
  cache.__bf_settings = undefined;
}

export const isOn = (v: string | undefined) => v === '1' || v === 'true';

/** Absolute site origin without a trailing slash. */
export async function siteUrl(): Promise<string> {
  const s = await getSettings();
  return (s['site.url'] || 'http://localhost:3000').replace(/\/+$/, '');
}

export async function absoluteUrl(path: string): Promise<string> {
  const base = await siteUrl();
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * Settings for render paths that must not be able to hang.
 *
 * A layout runs on every single page, so anything it awaits is a single point
 * of failure for the whole site: on Vercel a stalled settings read took every
 * page to a 300-second timeout while route handlers doing the same query
 * answered in under two seconds. Falling back to the defaults renders a
 * slightly generic page, which is strictly better than rendering nothing.
 */
export async function getSettingsForRender(): Promise<SettingsMap> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      getSettings(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('settings read timed out')), 5_000);
      }),
    ]);
  } catch {
    return { ...DEFAULT_SETTINGS } as SettingsMap;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
