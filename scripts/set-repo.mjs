#!/usr/bin/env node
/**
 * Point the docs at your own fork.
 *
 * The README and INSTALL deploy buttons, and the issue-template help link,
 * contain OWNER/REPO placeholders. They cannot be filled in until the
 * repository exists, so this rewrites them in one pass afterwards.
 *
 *   node scripts/set-repo.mjs yourname/blogforge
 */
import fs from 'node:fs';
import path from 'node:path';

const arg = process.argv[2];

if (!arg || !/^[\w.-]+\/[\w.-]+$/.test(arg)) {
  console.error('Usage: node scripts/set-repo.mjs <owner>/<repo>');
  console.error('Example: node scripts/set-repo.mjs shani/blogforge');
  process.exit(1);
}

const [owner, repo] = arg.split('/');
const root = process.cwd();

const targets = [
  'README.md',
  'INSTALL.md',
  'START-HERE.md',
  path.join('.github', 'ISSUE_TEMPLATE', 'config.yml'),
];

let changed = 0;

for (const rel of targets) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) continue;

  const before = fs.readFileSync(file, 'utf8');
  const after = before
    // URL-encoded form used inside the Vercel deploy-button query string
    .replaceAll('OWNER%2FREPO', `${owner}%2F${repo}`)
    // plain form used in normal links
    .replaceAll('OWNER/REPO', `${owner}/${repo}`);

  if (after !== before) {
    fs.writeFileSync(file, after);
    console.log(`updated ${rel}`);
    changed++;
  }
}

if (changed === 0) {
  console.log('Nothing to change — the placeholders are already filled in.');
} else {
  console.log(`\nDone. ${changed} file(s) updated for github.com/${owner}/${repo}`);
  console.log('Commit the change and the Deploy button will work for anyone who visits.');
}
