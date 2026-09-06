import 'server-only';
import { eq, sql } from 'drizzle-orm';
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

/**
 * Bumped whenever SCHEMA_SQL or ADDED_COLUMNS changes. A build stamps this into
 * settings; a matching stamp is what lets later boots skip the DDL entirely.
 */
const SCHEMA_VERSION = '1';
const SCHEMA_KEY = 'schema.version';

/**
 * Arbitrary constant for the Postgres advisory lock. Any number works as long
 * as every instance agrees on it.
 */
const BUILD_LOCK = 4711;

/**
 * The version already built, or null if the database is empty or unreachable in
 * a way that means "not built yet". Deliberately swallows the error: on a fresh
 * database the settings table does not exist and the query is *expected* to
 * fail.
 */
async function builtVersion(): Promise<string | null> {
  try {
    const { db, settings } = await import('./index');
    const [row] = await db
      .select({ value: settings.value })
      .from(settings)
      .where(eq(settings.key, SCHEMA_KEY))
      .limit(1);
    return row?.value ?? null;
  } catch {
    return null;
  }
}

/**
 * Build the schema at most once across every process sharing this database.
 *
 * The DDL used to run on every cold start, guarded only by a per-process
 * promise. That is fine on a VPS with one process and catastrophic on
 * serverless, where each instance is its own process: a burst of cold starts
 * has every instance issuing `ALTER TABLE … ADD COLUMN` at once, each taking an
 * ACCESS EXCLUSIVE lock on posts, each blocking the rest until the database
 * kills them with "canceling statement due to statement timeout". The site
 * then never comes up, and more traffic makes it worse.
 *
 * So: a cheap version check short-circuits the common case, and the build
 * itself is serialised behind an advisory lock, with a second check inside for
 * whoever was queued behind the winner.
 */
export async function ensureSchema(): Promise<void> {
  if ((await builtVersion()) === SCHEMA_VERSION) return;

  const { execScript, db, isRemote } = await import('./index');

  // PGlite is single-process, so the lock is unnecessary there — and asking for
  // one costs a round trip on the path that matters most for local dev.
  const locked = isRemote
    ? await db
        .execute(sql`SELECT pg_advisory_lock(${BUILD_LOCK})`)
        .then(() => true)
        .catch(() => false)
    : false;

  try {
    // Whoever waited on the lock gets here after the winner finished.
    if ((await builtVersion()) === SCHEMA_VERSION) return;

    await execScript(SCHEMA_SQL);
    await execScript(ADDED_COLUMNS);
    await seedDefaults();
    await stampVersion();
  } finally {
    if (locked) {
      await db.execute(sql`SELECT pg_advisory_unlock(${BUILD_LOCK})`).catch(() => {});
    }
  }
}

async function stampVersion(): Promise<void> {
  const { db, settings } = await import('./index');
  await db
    .insert(settings)
    .values({ key: SCHEMA_KEY, value: SCHEMA_VERSION })
    .onConflictDoUpdate({ target: settings.key, set: { value: SCHEMA_VERSION } });
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
