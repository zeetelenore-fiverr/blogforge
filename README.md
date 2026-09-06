# BlogForge

**Self-hosted AI blog automation that runs entirely on free tiers.** Research
keywords, write SEO articles, generate the images, publish on a schedule, screen
against AdSense policy, and repair your own indexing problems — on your own
Vercel account, with your own database, using your own free API keys.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fzeetelenore-fiverr%2Fblogforge&project-name=blogforge&repository-name=blogforge&env=APP_SECRET,DATABASE_URL,CRON_SECRET&envDescription=APP_SECRET%20and%20CRON_SECRET%20are%20long%20random%20strings.%20DATABASE_URL%20is%20your%20Supabase%20pooled%20connection%20string.&envLink=https%3A%2F%2Fgithub.com%2Fzeetelenore-fiverr%2Fblogforge%2Fblob%2Fmain%2FINSTALL.md)
&nbsp;
![License](https://img.shields.io/badge/license-MIT-blue)
![Next.js](https://img.shields.io/badge/Next.js-15-black)
![Postgres](https://img.shields.io/badge/Postgres-Supabase%20%7C%20Neon%20%7C%20local-336791)

There is no hosted service and no account to create with anyone but the free
providers you choose. You own the deployment, the database, the keys and the
content.

**New to this?** → **[START-HERE.md](START-HERE.md)** explains every step in
plain English and assumes no coding experience.
**Comfortable with GitHub and env vars?** → **[INSTALL.md](INSTALL.md)**.

---

## What it costs

Nothing, at the scale a personal blog runs at.

| | Free tier used |
| --- | --- |
| Hosting | Vercel Hobby |
| Database | Supabase free Postgres (or any Postgres, or none locally) |
| Writing | Google Gemini free tier — Groq, OpenRouter, Cerebras, Mistral and others also supported |
| Images | Pollinations — keyless, works with no signup at all |
| Keyword research | Google Autocomplete + Datamuse — keyless |
| SEO checks | Built-in analyzer, runs locally; PageSpeed and Search Console are free |

No credit card is required for any of it.

---

## What it does

### Free AI providers, with automatic failover

Every provider has a free tier, and BlogForge treats them as a chain: it tries
them in priority order and moves to the next one when a free tier rate-limits,
which they do constantly. A 429 puts a provider in a 15-minute cooldown; a daily
cap you set is enforced locally.

| Purpose | Services supported |
| --- | --- |
| **Text** | Google Gemini, Groq, OpenRouter (`:free` models), Cerebras, Mistral, Cloudflare Workers AI, GitHub Models, Hugging Face, Together, Cohere, Ollama (local), any OpenAI-compatible endpoint |
| **Images** | Pollinations (keyless), Cloudflare Workers AI (FLUX/SDXL), Gemini image, Hugging Face, Together FLUX, Unsplash, Pexels |
| **Keywords** | Google Autocomplete (keyless), Datamuse (keyless), Wikipedia (keyless), AI expansion, Serper.dev, SerpApi |
| **SEO** | Built-in on-page analyzer (no network), PageSpeed Insights, Google Search Console, Bing Webmaster, IndexNow |

Keys are encrypted at rest with AES-256-GCM using `APP_SECRET` and are never sent
back to the browser. Each provider has a **Test** button that makes a real call.

### Keyword research without a paid tool

Google Autocomplete is queried with the seed plus every letter, question word and
modifier — the same trick paid keyword tools use, and it returns real queries
people type. Datamuse and Wikipedia widen entity coverage. An AI pass then adds
intent classification, topic clusters, difficulty estimates and title ideas.
Results are deduplicated, scored easiest-first and saved to a reusable pool.

Difficulty is a heuristic (phrase length, question shape, commercial modifiers),
not a paid metric. It is directionally useful for choosing what to write next; it
is not Ahrefs KD.

### Article generation

Each article runs a seven-step pipeline:

1. **Outline** — title, search intent, angle, supporting keywords, H2/H3 plan, FAQ, key takeaways
2. **Draft** — full Markdown against the article prompt
3. **Extras** — key-takeaways box and FAQ section added if the model skipped them
4. **Images** — a featured image plus **2–3 in-article images**, each with alt text. The model marks its own placements with `[[IMAGE: brief | alt]]`; if it places too few, the engine tops up from the section headings so the count is a floor rather than a hope
5. **Metadata** — meta title, meta description, excerpt, slug, tags
6. **Internal links** — model picks anchors from the existing library, with deterministic phrase-matching as fallback
7. **Assemble** — HTML render, JSON-LD, SEO score, save

Every step that can fail softly does. No image provider costs you the images, not
the article.

**Alt text is never skipped.** The model writes it during generation; if that
call fails, a deterministic description is used instead.

**In-article images are guaranteed.** Language models routinely ignore image
instructions, which leaves an article as a wall of text. After the placeholder
pass the engine counts what actually landed and generates the shortfall itself,
spread evenly across the section headings and skipping the ones with nothing to
illustrate (FAQ, key takeaways). The on-page checker scores anything under two
body images as a failure.

### Campaigns and scheduling

A campaign is a topic, a cadence and a set of writing rules:

- Interval from **every hour** to **once a week** (or any custom minute count)
- Articles per run, and an optional total cap
- Word count, tone, audience, language, point of view
- Publish as **draft** or **published**, or schedule individual posts for a future time
- Toggles for FAQ, key takeaways, table of contents, comparison table, external citations, internal linking
- Image count and a style string applied to every image prompt
- **Custom prompt** — replace the built-in article prompt entirely, with documented `{{variables}}`

Keywords come from the campaign's own list (in order), then the shared pool, then
fresh research from the seeds — so a campaign never runs dry.

### SEO

- **On-page analyzer**: 30+ weighted checks — title and meta lengths, keyword placement and density, heading structure, readability (Flesch), paragraph length, image alt coverage, internal/external links, anchor quality, schema, indexability. Runs locally, no quota.
- **Schema markup**: a cross-referenced JSON-LD `@graph` per post — Organization, WebSite, Person, ImageObject, BreadcrumbList, WebPage, BlogPosting, plus FAQPage and HowTo when the content supports them.
- **Automatic internal linking**, in both directions: new posts link out, and existing posts are edited to link *in*, so nothing is born an orphan.
- **Generated files**: `/sitemap.xml` (with image entries), `/robots.txt`, `/llms.txt`, `/feed.xml`, `/ads.txt`, `/indexnow/<key>.txt`.

### AdSense policy screening

Every article is screened against Google's programme policies **as it is
written**, before it can publish. The scan is local, instant and free:

- **Restricted subject matter** — adult, shocking, hateful, weapons, drugs,
  gambling, hacking and piracy, counterfeit goods. Each family carries its own
  match threshold, so a cooking article that mentions a knife is not a weapons
  page.
- **Misrepresentative content** — unsupported medical and financial claims,
  clickbait headlines.
- **Valuable inventory** — thin pages, missing structure, generic AI filler
  vocabulary.
- **Scaled content abuse** — the repetition pattern Google names explicitly for
  mass-produced AI publishing.
- **YMYL disclaimers** — health, financial and legal articles are flagged when
  they carry no "consult a professional" line.
- **Transparency** — undisclosed affiliate links, and the AI disclosure being
  switched off.

Verdicts are `pass`, `review` or `fail`, each with the specific remedy. When
**Hold back articles with a blocking issue** is on (the default), a failing
article is kept as a draft instead of going live — which matters when a campaign
publishes on its own.

An optional model pass adds judgement the term list cannot reach. It can only
raise a verdict, never lower one, so a provider outage degrades the check rather
than silently passing something risky.

**Fix issues** repairs the findings in place. Disclaimers, affiliate disclosure,
de-duplicated sentences and de-clickbaited titles are handled locally with no
provider at all; expanding a thin page or rewriting a non-compliant passage goes
to the model with the specific findings attached. Every change is additive or a
targeted replacement — nothing is deleted wholesale — and the article is
re-screened afterwards so the recorded verdict always describes what is now on
the page. The button only appears when something is genuinely actionable.

This screens the writing. It cannot promise approval — Google also reviews the
site as a whole, and nothing outside the articles is in scope here.

### Editing

Articles open in a WYSIWYG editor — headings, bold, italic, links, lists, quotes,
tables, images and undo/redo, with a one-click switch to raw Markdown for
anything the toolbar does not cover. Images can be inserted from the article's
own generated media or from a URL, and alt text is prompted for at insertion.

Markdown stays the canonical format: the SEO analyzer, policy scanner, internal
linker and schema builder all read it, so the editor serialises back to Markdown
on every keystroke. The round-trip is verified lossless on the sample articles —
headings, tables, images, links, quotes and lists all survive byte-identical.

### Reports

`/admin/reports` is the analytics view: publishing cadence over 30/90/365 days,
SEO score distribution, the content pipeline, indexing coverage, AdSense policy
readiness, output by topic and by campaign, and engine health.

Charts are server-rendered SVG with no charting library and no client
JavaScript. The palette was run through a CVD validator — colourblind
separation, normal-vision floor, lightness banding — rather than picked by eye,
every chart carries visible value labels rather than relying on colour, and the
whole dashboard has a table view.

### Indexing checker and auto-fix

Connect a Google Search Console service account and BlogForge reads the real
coverage verdict per URL through the URL Inspection API — "Crawled – currently
not indexed", "Discovered – currently not indexed", robots blocks, duplicate
canonicals.

Without Search Console it still runs local diagnosis: noindex flags, unpublished
posts, thin content, orphan pages, duplicate meta titles, missing schema, and
every failing on-page check.

**Auto-fix** then does deterministic repairs first (clear noindex, build internal
links in and out), and asks the model to close the content gaps behind a
not-indexed verdict — rewriting the intro, tightening metadata, and inserting new
sections at a named heading. Every change is recorded and shown back to you.

Fixed URLs are pushed to **IndexNow** (Bing, Yandex, Seznam, Naver) automatically.
The verification key is derived from `APP_SECRET` and served at
`/indexnow/<key>.txt` — no account needed.

**This runs on its own.** With **Check indexing automatically** on (the default),
the scheduler queues checks for the pages that have gone longest without one,
batched so a large site cannot exhaust the Search Console quota in a single run.
Turn on **Resolve issues automatically** and it repairs what it can without being
asked. That setting is off by default because it edits published articles — it
only ever adds, and every change is listed, but read a few fixes before trusting
it unattended.

### AdSense-ready front end

An editorial magazine layout — Swiss-grid discipline with print typography:
Libre Bodoni display over Public Sans, a dateline masthead, an asymmetric lead
story, a numbered "most read" rail, drop caps, pull quotes and hairline section
rules. Light and dark themes, both built from the same tokens.

Homepage with lead story and topic sections, blog index, category, tag and
author archives, search, breadcrumbs, related posts, a two-column table of
contents, reading-progress bar, share row and RSS.

Six complete sample articles ship with it — load them from **Posts** to judge
the layout before adding a single API key.

`npm run setup` seeds the pages a review actually looks for — About, Contact,
Privacy Policy (with the required Google advertising-cookie disclosure), Terms
and an Editorial Policy — and the Pages screen warns you if any are missing.

AdSense settings live under **Settings → AdSense**: publisher ID, auto ads,
in-article and sidebar slots, and a generated or custom `ads.txt`.

### Header and footer editor

Paste raw HTML into **Settings → Header & footer**. `<meta>`, `<link>`, `<script>`
and `<style>` tags are parsed and rendered as real elements so verification tags
reach the document head — a raw string injected into the body never does. GA4 and
GTM have dedicated fields, and there are one-field slots for Google, Bing, Yandex
and Pinterest verification.

---

## Configuration

`.env` (created by `npm run setup`):

| Variable | Purpose |
| --- | --- |
| `APP_SECRET` | **Required.** Encrypts stored API keys, signs sessions, derives the IndexNow key. Changing it makes stored keys unreadable. |
| `SITE_URL` | Public origin. Also settable in the admin. |
| `DATABASE_URL` | A Postgres connection string. Leave unset locally and the app runs Postgres in-process (PGlite) from `./data/pg`. |
| `CRON_SECRET` | Shared secret for `/api/cron/tick` |
| `INLINE_SCHEDULER` | `1` to run the scheduler inside the Next.js process |

---

## Running the scheduler

**On a VPS, Docker or locally** — set `INLINE_SCHEDULER=1`. A tick runs every 60
seconds inside the app: it publishes due posts, queues campaign runs, and drains
the job queue.

**On serverless** — leave it off and call the endpoint on a schedule:

```
GET /api/cron/tick?secret=$CRON_SECRET
```

`vercel.json` already declares an hourly cron. Any free cron service
(cron-job.org, GitHub Actions, UptimeRobot) works just as well. Authorization can
be a `Bearer` header or the `?secret=` query parameter.

Jobs retry three times with exponential backoff, and the queue is visible under
**Activity** with per-job progress.

---

## Deployment notes

**Self-hosted (recommended).** In-process Postgres, local image storage, inline
scheduler. Nothing to provision at all — clone, `npm run setup`, `npm run dev`.

**Vercel or other serverless.** Two things do not survive a read-only,
ephemeral filesystem, and you need to handle both:

1. **Database** — the local Postgres directory would be wiped between
   invocations. Point `DATABASE_URL` at a free [Supabase](https://supabase.com)
   project, using its **pooled** connection string (port 6543). Same dialect,
   same schema, no code change.
2. **Images** — generated images are written to `public/uploads`, which is not
   writable. Pollinations falls back to hotlinking its own URL automatically.
   For everything else, use **Unsplash** or **Pexels** as the image provider —
   they return hosted URLs and need no local storage.

---

## Project layout

```
src/
  app/
    (site)/          public blog: home, blog, category, tag, author, search, pages
    admin/           dashboard, posts, campaigns, keywords, SEO, indexing, links, settings
    api/cron/tick    scheduler endpoint
    sitemap.xml · robots.txt · llms.txt · feed.xml · ads.txt · indexnow/[key]
  engine/
    generate.ts      the article pipeline
    prompts.ts       every prompt, including the editable default
    seo-analyzer.ts  the on-page checks
    schema.ts        JSON-LD @graph builder
    internal-links.ts
    keywords.ts      research orchestration
    indexing.ts      GSC checks + AI auto-fix
    scheduler.ts     job queue and campaign ticks
  providers/
    catalog.ts       the free-service catalog shown in the admin
    text.ts · image.ts · keywords.ts · seo.ts     adapters
    index.ts         provider selection, failover, quota tracking
  db/
    schema.ts        Drizzle schema (Postgres)
    schema-sql.ts    the DDL, bundled so a hosted install can build itself
    migrate.ts       auto-migration + default seeding on first request
    index.ts         driver selection: Supabase/Neon or in-process PGlite
```

---

## Forking it

After you publish your own copy, point the deploy button and help links at it:

```bash
npm run set-repo -- yourname/blogforge
```

Then commit. Until you do, the Deploy button on your README sends people to a
repository that does not exist.

## Contributing

Issues and pull requests are welcome — see **[CONTRIBUTING.md](CONTRIBUTING.md)**.
The most useful contributions are new free-tier provider adapters and real-world
AdSense policy findings.

Security reports: **[SECURITY.md](SECURITY.md)** — please use private disclosure
rather than a public issue.

## Licence

MIT. Do what you like with it, including commercially. No warranty.

---

## Honest limitations

- **Difficulty and volume are estimates.** There is no free source of real search
  volume. Volume is left blank unless a SERP provider supplies it; difficulty is a
  heuristic.
- **AI content is not automatically good content.** The default prompt is written
  to avoid the obvious tells, and the SEO score is a real check — but publishing
  100 unreviewed articles is how sites get buried. Use draft mode, read what it
  writes.
- **Disclose the automation.** The AI disclosure is on by default and shown in the
  footer and on each article. Undisclosed mass-produced content is exactly what
  gets AdSense applications rejected.
- **Search Console needs a real domain.** Indexing checks against `localhost` will
  correctly tell you the site cannot be indexed.
- **Free tiers change.** The catalog notes what each service offered when it was
  written, not a guarantee.
