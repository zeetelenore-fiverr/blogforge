import { getSettings } from '@/lib/settings';
import { db, posts, categories } from '@/db';
import { sql } from 'drizzle-orm';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Times the data a page render needs, from a route handler.
 *
 * Route handlers kept serving while every page timed out, and the two differ in
 * only two ways: what they load, and that pages render React. This isolates the
 * first, so a fast result here points squarely at the second.
 */
export async function GET() {
  const marks: Record<string, number> = {};
  const time = async <T>(name: string, run: () => Promise<T>): Promise<T | string> => {
    const t = Date.now();
    try {
      const out = await run();
      marks[name] = Date.now() - t;
      return out;
    } catch (err) {
      marks[name] = Date.now() - t;
      return `ERROR: ${err instanceof Error ? err.message : String(err)}`;
    }
  };

  const s = await time('getSettings', () => getSettings());
  await time('countPosts', () => db.select({ n: sql<number>`COUNT(*)::int` }).from(posts));
  await time('listCategories', () => db.select({ name: categories.name }).from(categories).limit(8));
  await time('getSettingsAgain', () => getSettings());

  return Response.json({
    ok: true,
    marks,
    siteUrl: typeof s === 'string' ? s : s['site.url'],
    schemaVersion: typeof s === 'string' ? null : s['schema.version'],
    env: {
      hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
      databaseUrlHost: (process.env.DATABASE_URL || '').replace(/^.*@/, '').split('/')[0] || null,
      hasAppSecret: Boolean(process.env.APP_SECRET),
      siteUrlEnv: process.env.SITE_URL || null,
      node: process.version,
    },
  });
}
