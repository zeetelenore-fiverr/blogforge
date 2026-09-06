import 'server-only';
import { eq, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type * as dbSchema from './schema';
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

type Db = PostgresJsDatabase<typeof dbSchema>;
type SeedData = typeof seedData;

const SCHEMA_VERSION = '1';
const SCHEMA_KEY = 'schema.version';

/** Arbitrary constant; every instance just has to agree on it. */
const BUILD_LOCK = 4711;

/**
 * Anything that can run queries: the db handle or a transaction. Lets the build
 * steps below run inside the bootstrap transaction and nowhere else.
 */
type Executor = Pick<Db, 'select' | 'insert' | 'execute'>;

/**
 * Split a bundled script into single statements.
 *
 * Necessary because the extended query protocol drizzle uses for `execute`
 * rejects multi-statement strings, and the whole build has to sit inside one
 * transaction to be safe under a connection pooler. The schema SQL is plain
 * DDL with no dollar-quoting and no semicolons inside literals, so splitting on
 * the semicolon is sound here — it is not a general-purpose SQL parser.
 */
function statements(script: string): string[] {
  return script
    .replace(/^s*--.*$/gm, '')
    .split(';')
    .map((line) => line.trim())
    .filter(Boolean);
}

/** postgres-js returns an array, PGlite returns { rows }. Normalise both. */
function firstRow<T>(result: unknown): T | undefined {
  const r = result as T[] | { rows?: T[] };
  return Array.isArray(r) ? r[0] : r?.rows?.[0];
}

/**
 * The schema version already built, or null if it has never been built.
 *
 * Probes with `to_regclass`, which yields NULL for a missing table rather than
 * raising. Selecting straight from settings would work outside a transaction
 * but is fatal inside one: on a fresh database the missing-table error aborts
 * the whole transaction, and every later statement fails with 25P02 even though
 * the JavaScript error was caught. That is not hypothetical — it is what a
 * try/catch here did before this comment existed.
 */
async function builtVersion(run: Executor): Promise<string | null> {
  const probe = await run.execute(sql`SELECT to_regclass('public.settings') AS present`);
  if (!firstRow<{ present: string | null }>(probe)?.present) return null;

  const { settings } = await import('./index');
  const [row] = await run
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, SCHEMA_KEY))
    .limit(1);
  return row?.value ?? null;
}

/**
 * Build the schema at most once across every process sharing this database.
 *
 * Two things went wrong before this, both only visible on a real serverless
 * deployment. First, the DDL ran on every cold start behind a per-process
 * promise, so a burst of instances issued `ALTER TABLE … ADD COLUMN`
 * simultaneously, each taking an ACCESS EXCLUSIVE lock on posts and blocking
 * the rest until the server killed them at its statement timeout. Second, the
 * obvious fix — `pg_advisory_lock` — is session-scoped, and a transaction-mode
 * pooler routes each statement to whichever backend is free: the lock is taken
 * on one connection, the unlock lands on another and fails, and the orphaned
 * lock blocks every later instance until the pooler recycles that backend.
 *
 * So the version check below keeps the built case free of DDL entirely, and the
 * build itself runs inside one transaction holding a *transaction*-scoped lock.
 * A pooler pins a transaction to a single backend, and the lock is released by
 * COMMIT or ROLLBACK — including when the function is killed mid-build.
 */
export async function ensureSchema(): Promise<void> {
  const { db } = await import('./index');

  if ((await builtVersion(db)) === SCHEMA_VERSION) return;

  // Three attempts, because losing the race to another instance is a normal
  // outcome, not a failure: the winner builds, we re-check and find it done.
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await db.transaction(async (tx) => {
        // Nothing in a boot path may block indefinitely. Without these, a lock
        // held by a crashed or orphaned session makes every request hang until
        // the platform kills it -- observed on Vercel as a clean 300s timeout on
        // every page while route handlers, which had already found the schema
        // built, kept serving normally.
        await tx.execute(sql`SET LOCAL lock_timeout = '10s'`);
        await tx.execute(sql`SET LOCAL statement_timeout = '60s'`);
        await tx.execute(sql`SELECT pg_advisory_xact_lock(${BUILD_LOCK})`);

        // Whoever queued behind the winner arrives here after it committed.
        if ((await builtVersion(tx)) === SCHEMA_VERSION) return;

        for (const statement of [...statements(SCHEMA_SQL), ...statements(ADDED_COLUMNS)]) {
          await tx.execute(sql.raw(statement));
        }

        await seedDefaults(tx);
        const { settings } = await import('./index');
        await tx
          .insert(settings)
          .values({ key: SCHEMA_KEY, value: SCHEMA_VERSION })
          .onConflictDoUpdate({ target: settings.key, set: { value: SCHEMA_VERSION } });
      });
      return;
    } catch (err) {
      // Someone else may have finished while we were timing out on the lock.
      if ((await builtVersion(db)) === SCHEMA_VERSION) return;
      if (attempt === 3) {
        throw new Error(
          `Could not build the database schema after ${attempt} attempts: ${
            err instanceof Error ? err.message : String(err)
          }. If this says "lock timeout", another process is stuck mid-build -- ` +
            'restarting the database server clears it.',
        );
      }
    }
  }
}

/**
 * Idempotent defaults: the keyless providers, the starter categories, and the
 * pages an AdSense review looks for. Only inserts what is missing, so it is
 * safe on every boot.
 */
async function seedDefaults(run: Executor): Promise<void> {
  const { providers, categories, pages, settings } = await import('./index');
  const data = seedData as SeedData;

  const [{ n }] = await run
    .select({ n: sql<number>`COUNT(*)::int` })
    .from(providers);

  if (Number(n) === 0) {
    await run.insert(providers).values(
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

  await run
    .insert(categories)
    .values(data.categories.map((c) => ({ name: c.name, slug: c.slug, description: c.description })))
    .onConflictDoNothing({ target: categories.slug });

  await run
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

  await run
    .insert(settings)
    .values({ key: 'site.url', value: process.env.SITE_URL || 'http://localhost:3000' })
    .onConflictDoNothing({ target: settings.key });
}
