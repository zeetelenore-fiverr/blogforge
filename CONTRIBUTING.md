# Contributing

Thanks for looking. This started as one person's tool and is more useful with
other people's eyes on it.

## Getting set up

```bash
git clone https://github.com/<your-fork>/blogforge.git
cd blogforge
npm install
npm run setup     # writes .env with a fresh APP_SECRET
npm run dev
```

Open <http://localhost:3000/admin/setup> and create an account.

No database to install: with `DATABASE_URL` unset the app runs Postgres
in-process (PGlite) from `./data/pg`. It is real Postgres, so anything that
works locally works on Supabase.

To develop against a real server instead, put a connection string in
`DATABASE_URL` and restart.

## Before opening a pull request

```bash
npx tsc --noEmit    # must be clean
npm run build       # must succeed
```

Then click through what you changed. Most of this project is server components
talking to a database — a type-check proves less than you would like.

## What is most useful

- **Provider adapters.** New free tiers appear constantly. Adding one is a
  catalog entry in `src/providers/catalog.ts` plus an adapter case.
- **Policy rules.** `src/engine/adsense-policy.ts` is a term list plus
  thresholds. Real rejection experience is worth more than more terms.
- **SEO checks.** `src/engine/seo-analyzer.ts` is self-contained and pure.
- **Translations.** Nothing is localised yet.

## House style

- Comments explain *why*, not *what*. If a line needs a comment to say what it
  does, rewrite the line.
- Fail soft in the generation pipeline. A dead provider should cost you a
  feature, not the article.
- Prefer a deterministic path with an AI enhancement over an AI-only path. Most
  of this codebase works with no API key at all, and that is worth keeping.
- No new dependency without a reason you would defend in review.

## Things to know before you dig in

- Markdown is the canonical content format. The editor serialises back to it;
  the analyzer, policy scanner, linker and schema builder all read it.
- Correlated subqueries inside a Drizzle `.select()` return nothing silently.
  Use `leftJoin` + `groupBy` for counts. This has bitten the project once
  already and cost a sitemap.
- The scheduler is a single tick function. Anything slow belongs in the job
  queue, not inline.
