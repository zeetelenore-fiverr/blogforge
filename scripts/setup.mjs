#!/usr/bin/env node
/**
 * Local installer. Creates .env with a fresh APP_SECRET and prints what to do
 * next.
 *
 * It deliberately does NOT touch the database: the app builds its own schema
 * and seeds its defaults on the first request, and creates the owner account
 * through /admin/setup. That is the same path a Vercel deploy takes, so local
 * and hosted installs cannot drift.
 *
 * Safe to re-run.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const envPath = path.join(root, '.env');

if (fs.existsSync(envPath)) {
  console.log('.env already exists — leaving it alone.\n');
} else {
  const secret = crypto.randomBytes(32).toString('base64url');
  const cron = crypto.randomBytes(16).toString('base64url');
  fs.writeFileSync(
    envPath,
    [
      '# Encrypts stored API keys and signs admin sessions. Keep it secret;',
      '# changing it makes existing stored keys unreadable.',
      `APP_SECRET="${secret}"`,
      '',
      '# Public origin of the blog.',
      'SITE_URL="http://localhost:3000"',
      '',
      '# Shared secret for the scheduler endpoint /api/cron/tick',
      `CRON_SECRET="${cron}"`,
      '',
      '# Leave unset for a local Postgres-in-process database under ./data/pg.',
      '# For Supabase (or any Postgres) paste the pooled connection string:',
      '# DATABASE_URL="postgresql://postgres.PROJECT:PASSWORD@aws-0-REGION.pooler.supabase.com:6543/postgres"',
      '',
      '# Run the scheduler inside the Next.js process (right for local + VPS).',
      'INLINE_SCHEDULER="1"',
      '',
    ].join('\n'),
  );
  console.log('Created .env with a fresh APP_SECRET.\n');
}

fs.mkdirSync(path.join(root, 'data'), { recursive: true });

console.log('BlogForge is ready to start.\n');
console.log('  1.  npm run dev');
console.log('  2.  open http://localhost:3000/admin/setup   (create your account)');
console.log('  3.  add a free Gemini key at /admin/providers\n');
console.log('The database builds itself on the first request — nothing to migrate.\n');
console.log('Using Supabase instead? Put its pooled connection string in DATABASE_URL');
console.log('inside .env, then start the app. See INSTALL.md.\n');
