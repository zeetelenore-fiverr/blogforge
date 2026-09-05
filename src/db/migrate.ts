import 'server-only';
import { sql } from 'drizzle-orm';
import seedData from './seed-data.json';
import { SCHEMA_SQL } from './schema-sql';

/**
 * Schema creation and default seeding, run automatically on first use.
 *
 * This is what makes a hosted install work with no terminal: point
 * `DATABASE_URL` at a Supabase project, open the site, and the database builds
 * itself. The SQL is compiled into the bundle, so nothing depends on files
 * surviving deployment.
 */

/**
 * Columns added after the first release. `CREATE TABLE IF NOT EXISTS` cannot
 * bring an existing database forward, so anything added later is listed here
 * too. Postgres has `ADD COLUMN IF NOT EXISTS`, so this is a plain script.
 */
const ADDED_COLUMNS = `
ALTER TABLE posts ADD COLUMN IF NOT EXISTS policy_status TEXT NOT NULL DEFAULT 'unchecked';
ALTER TABLE posts ADD COLUMN IF NOT EXISTS policy_issues TEXT NOT NULL DEFAULT '[]';
ALTER TABLE posts ADD COLUMN IF NOT EXISTS policy_checked_at TIMESTAMPTZ;
`;

type SeedData = typeof seedData;

export async function ensureSchema(): Promise<void> {
  const { execScript } = await import('./index');
  await execScript(SCHEMA_SQL);
  await execScript(ADDED_COLUMNS);
  await seedDefaults();
}

/**
 * Idempotent defaults: the keyless providers, the starter categories, and the
 * pages an AdSense review looks for. Only inserts what is missing, so it is
 * safe on every boot.
 */
async function seedDefaults(): Promise<void> {
  const { db, providers, categories, pages, settings } = await import('./index');
  const data = seedData as SeedData;

  const [{ n }] = await db
    .select({ n: sql<number>`COUNT(*)::int` })
    .from(providers);

  if (Number(n) === 0) {
    await db.insert(providers).values(
      data.providers.map((p) => ({
        kind: p.kind as 'text' | 'image' | 'keyword' | 'seo',
        providerId: p.providerId,
        label: p.label,
        apiKey: '',
        extra: '{}',
        model: p.model,
        priority: p.priority,
        enabled: true,
      })),
    );
  }

  await db
    .insert(categories)
    .values(data.categories.map((c) => ({ name: c.name, slug: c.slug, description: c.description })))
    .onConflictDoNothing({ target: categories.slug });

  await db
    .insert(pages)
    .values(
      data.pages.map((p) => ({
        title: p.title,
        slug: p.slug,
        contentMd: p.contentMd,
        contentHtml: '',
        metaTitle: p.title,
        metaDescription: '',
        status: 'published' as const,
        showInHeader: p.showInHeader === 1,
        showInFooter: true,
        sortOrder: p.sortOrder,
      })),
    )
    .onConflictDoNothing({ target: pages.slug });

  await db
    .insert(settings)
    .values({ key: 'site.url', value: process.env.SITE_URL || 'http://localhost:3000' })
    .onConflictDoNothing({ target: settings.key });
}
