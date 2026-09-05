import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from './schema';
import { ensureSchema } from './migrate';

/**
 * Postgres everywhere — the same schema and the same SQL whether you point
 * `DATABASE_URL` at Supabase, Neon, or nothing at all.
 *
 * - `postgres://…` / `postgresql://…` → a real server (Supabase, Neon, RDS…)
 * - anything else (or unset)          → PGlite, Postgres compiled to WASM,
 *   stored in ./data. Real Postgres semantics with nothing to install, so
 *   `npm run dev` works on a clean machine.
 *
 * Both go through drizzle's pg-core, so there is one dialect to reason about.
 */

const raw = process.env.DATABASE_URL?.trim() || '';
export const isRemote = /^postgres(ql)?:\/\//i.test(raw);

type Db = PostgresJsDatabase<typeof schema>;

const g = globalThis as unknown as {
  __bf_db?: Db;
  __bf_ready?: Promise<void>;
  __bf_exec?: (sql: string) => Promise<void>;
};

/**
 * Both drivers expose the same drizzle pg-core query builder, so one type
 * describes either. The cast is the seam between them.
 */
function create(): Db {
  if (isRemote) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const postgres = require('postgres') as typeof import('postgres');
    const { drizzle } = require('drizzle-orm/postgres-js') as typeof import('drizzle-orm/postgres-js');

    const client = postgres(raw, {
      // Supabase's pooler runs pgBouncer in transaction mode, which cannot
      // hold prepared statements between queries.
      prepare: false,
      // Serverless invocations are short-lived and numerous; a big pool per
      // instance is how you exhaust a Postgres connection limit.
      max: Number(process.env.DATABASE_MAX_CONNECTIONS) || 1,
      idle_timeout: 20,
      connect_timeout: 15,
    });

    g.__bf_exec = async (sqlText: string) => {
      await client.unsafe(sqlText);
    };
    return drizzle(client, { schema });
  }

  const { PGlite } = require('@electric-sql/pglite') as typeof import('@electric-sql/pglite');
  const { drizzle } = require('drizzle-orm/pglite') as typeof import('drizzle-orm/pglite');

  const dir = raw.replace(/^file:/, '') || path.join(process.cwd(), 'data', 'pg');
  const resolved = path.resolve(process.cwd(), dir);
  // PGlite's own mkdir is not recursive, so a fresh clone with no ./data would
  // fail before it ever opened the database.
  fs.mkdirSync(resolved, { recursive: true });
  const client = new PGlite(resolved);

  g.__bf_exec = async (sqlText: string) => {
    try {
      await client.exec(sqlText);
    } catch (err) {
      // PGlite is single-process. Two dev servers, or a script poking the same
      // directory, corrupt it and surface as an opaque WASM abort.
      if (String(err).includes('Aborted')) {
        throw new Error(
          `The local database at ${dir} could not be opened. PGlite allows one ` +
            'process at a time — check that a second "npm run dev" is not ' +
            `running. If nothing else is using it, delete ${dir} and restart; ` +
            'the schema rebuilds itself. Set DATABASE_URL to use a real ' +
            'Postgres server instead.',
        );
      }
      throw err;
    }
  };
  return drizzle(client, { schema }) as unknown as Db;
}

function handle(): Db {
  // Next.js hot-reloads modules in dev; cache so we don't open a new connection
  // (or a second PGlite instance on the same directory) per request.
  return g.__bf_db ?? (g.__bf_db = create());
}

/**
 * Lazy on purpose. `next build` imports every module that touches the database,
 * and opening one at import time means the build needs a live database — and,
 * with the in-process driver, fights the dev server for the same directory.
 * Nothing connects until the first actual query.
 */
export const db: Db = new Proxy({} as Db, {
  get: (_t, prop, receiver) => Reflect.get(handle() as object, prop, receiver),
  has: (_t, prop) => Reflect.has(handle() as object, prop),
});

/** Run a multi-statement script. Driver-specific, so it lives here. */
export function execScript(sqlText: string): Promise<void> {
  handle(); // ensure the driver exists before reaching for its exec hook
  if (!g.__bf_exec) throw new Error('Database is not initialised');
  return g.__bf_exec(sqlText);
}

/**
 * Resolves once the schema exists. Awaited by `getSettings()` and
 * `currentUser()`, which between them run before every page, route handler and
 * server action — so a fresh hosted install builds its own database on the
 * first request with no terminal access.
 */
export function dbReady(): Promise<void> {
  if (!g.__bf_ready) {
    g.__bf_ready = ensureSchema().catch((err) => {
      // Let the next call retry rather than caching a permanent failure.
      g.__bf_ready = undefined;
      throw err;
    });
  }
  return g.__bf_ready;
}

export { schema };
export * from './schema';
