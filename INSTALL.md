# Installing BlogForge on Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fzeetelenore-fiverr%2Fblogforge&project-name=blogforge&repository-name=blogforge&env=APP_SECRET,DATABASE_URL,CRON_SECRET&envDescription=APP_SECRET%20and%20CRON_SECRET%20are%20long%20random%20strings.%20DATABASE_URL%20is%20your%20Supabase%20pooled%20connection%20string.&envLink=https%3A%2F%2Fgithub.com%2Fzeetelenore-fiverr%2Fblogforge%2Fblob%2Fmain%2FINSTALL.md)

The button above does Steps 1 and 4 in one go — it forks the repository into
your GitHub account and asks for the three environment variables. You still need
the Supabase database (Step 2) and the secrets (Step 3) ready first, so read on.

A complete walkthrough for deploying BlogForge to Vercel using **free tiers only**.
No terminal, no local Node install, and no AI coding tool required — everything
happens in a browser.

**Time:** about 20 minutes.
**Cost:** nothing. Every service below has a free tier that covers a small blog.

> **Never done anything like this before?** Read
> **[START-HERE.md](START-HERE.md)** instead. Same result, but it explains what
> each tool is, defines the jargon, and does not assume you know what an
> environment variable is.

---

## What you will end up with

- A live blog on a `*.vercel.app` domain (or your own domain)
- An admin dashboard at `/admin`
- Articles that write, illustrate and publish themselves on a schedule
- A sitemap, RSS feed, robots.txt, llms.txt and schema markup, all generated

---

## Before you start

Create these three free accounts. You do not need a credit card for any of them.

| Account | What it is for | Sign-up |
| --- | --- | --- |
| **GitHub** | Stores the code Vercel deploys | [github.com/signup](https://github.com/signup) |
| **Vercel** | Runs the site | [vercel.com/signup](https://vercel.com/signup) — choose "Continue with GitHub" |
| **Supabase** | The database | [supabase.com](https://supabase.com) — sign in with GitHub |

> **Why a hosted database?** Vercel wipes the server's disk between requests, so
> a local database file would lose your posts. Supabase gives you a free hosted
> Postgres that stays put. Any Postgres works — Neon, Railway, your own — the
> app only needs a connection string.

---

## Step 1 — Put the code on GitHub

1. Open the BlogForge repository on GitHub.
2. Click **Fork** (top right), then **Create fork**.

You now have your own copy at `github.com/<your-username>/blogforge`.

*If you received BlogForge as a ZIP file instead:* go to
[github.com/new](https://github.com/new), create an empty repository named
`blogforge`, then on the new repository's page click **uploading an existing
file** and drag in the contents of the unzipped folder. Do **not** upload the
`node_modules` folder if one is present.

---

## Step 2 — Create the database

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) and click
   **New project**.
2. Name it `blogforge`, set a database password (save it), and pick the region
   closest to your readers. Creating the project takes a minute or two.
3. Open **Connect** (top of the project page) and choose the **Transaction
   pooler** connection string. It looks like:

   ```
   postgresql://postgres.abcdefgh:[YOUR-PASSWORD]@aws-0-eu-west-2.pooler.supabase.com:6543/postgres
   ```

4. Replace `[YOUR-PASSWORD]` with the password from step 2 and copy the whole
   line somewhere safe.

> **Take the Transaction pooler, not Session pooler or Direct connection.**
> Serverless functions open a new connection per invocation, and both of the
> others use port `:5432` and run out of connections quickly. The transaction
> pooler on `:6543` is built for exactly this, and BlogForge is configured to
> match it.

You do not need to create any tables, run any SQL, or touch the schema editor.
BlogForge builds its own database structure the first time the site is opened.

---

## Step 3 — Generate your secret key

BlogForge needs one long random string. It encrypts your stored API keys and
signs your login session.

Open [this random string generator](https://www.random.org/strings/?num=1&len=32&digits=on&upperalpha=on&loweralpha=on&unique=on&format=html&rnd=new)
and copy the 32-character result. Any long random text works — just make it
unique and keep it private.

> Save this somewhere. If you change it later, every API key you have stored
> becomes unreadable and has to be entered again.

---

## Step 4 — Deploy to Vercel

1. Go to [vercel.com/new](https://vercel.com/new).
2. Find your `blogforge` repository and click **Import**.
3. Leave the framework preset (Next.js), root directory and build settings
   exactly as they are.
4. Expand **Environment Variables** and add these:

| Name | Value |
| --- | --- |
| `APP_SECRET` | The random string from Step 3 |
| `DATABASE_URL` | Your Supabase pooled connection string from Step 2 |
| `CRON_SECRET` | Another random string (generate a second one) |

5. Click **Deploy** and wait — the first build takes two to four minutes.

When it finishes, Vercel shows you a URL like
`https://blogforge-abc123.vercel.app`. That is your blog.

---

## Step 5 — Tell BlogForge its own address

Vercel only knows the URL after the deploy, so add it now.

1. In your Vercel project, go to **Settings → Environment Variables**.
2. Add `SITE_URL` with your full URL, no trailing slash:
   `https://blogforge-abc123.vercel.app`
3. Go to the **Deployments** tab, open the newest deployment's **⋯** menu, and
   choose **Redeploy**.

---

## Step 6 — Create your account

1. Visit `https://your-site.vercel.app/admin/setup`.
2. Fill in your name, email, a password of at least 8 characters, and your site
   URL.
3. Click **Create account and finish**.

You are now signed in. That setup page disappears permanently once an account
exists.

---

## Step 7 — Add a free AI provider

This is the only step that decides whether the blog can actually write.

1. Open [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
   and sign in with a Google account.
2. Click **Create API key** and copy it. No card is required.
3. In BlogForge, go to **AI providers → Add text generation provider**.
4. Leave **Google Gemini** selected, paste the key, and click **Add provider**.
5. Click **Test** on the new row. It should say "Responded: OK".

Image generation already works with no key at all — Pollinations is
pre-installed.

**Add a second provider while you are here.** Free tiers rate-limit constantly,
and BlogForge automatically falls through to the next provider when one is
unavailable. [Groq](https://console.groq.com/keys) and
[OpenRouter](https://openrouter.ai/keys) are both good, both free, and both take
about a minute.

---

## Step 8 — Publish your first articles

**To see the layout immediately:** go to **Posts** and click **Load sample
articles**. Six complete articles appear, images and all. Delete them whenever
you like.

**To publish your own:**

1. Go to **Keywords**, type a topic in **Research a topic**, and click
   **Research keywords**. This uses Google Autocomplete and needs no key.
2. Go to **Campaigns → New campaign**.
3. Give it a name, paste some keywords (one per line), set the interval — **once
   a day** is a sensible start — and set **Publish as: Draft** for now.
4. Set the status to **Active** and save.
5. Click **Run once now**, then check **Posts** in a minute.

Read the first few articles before switching the campaign to publish
automatically.

---

## Step 9 — Turn on the scheduler

Vercel needs to be told to wake the site up on a schedule. The repository
already includes `vercel.json`, which asks for an hourly run.

On Vercel's free Hobby plan, cron jobs run **once per day** and the exact time is
chosen by Vercel. That is enough for one-article-a-day publishing.

**To check it is working:** Vercel project → **Settings → Cron Jobs**. You should
see `/api/cron/tick` listed.

**If you want more frequent runs on the free plan,** use an external cron service
instead — [cron-job.org](https://cron-job.org) is free and reliable:

1. Create a job pointing at
   `https://your-site.vercel.app/api/cron/tick?secret=YOUR_CRON_SECRET`
2. Set it to run every 15 minutes.

---

## Step 10 — Connect Google Search Console

Optional, but it is what powers the indexing checks and the AI auto-fix.

1. Go to [search.google.com/search-console](https://search.google.com/search-console)
   and add your site as a **URL prefix** property.
2. Choose the **HTML tag** verification method and copy just the `content` value
   from the tag it shows you.
3. In BlogForge: **Settings → SEO → Site verification → Google**, paste it, and
   save.
4. Back in Search Console, click **Verify**.
5. Then go to **Sitemaps** and submit `sitemap.xml`.

For the full indexing report and auto-fix, follow the extra service-account
steps shown in **Settings → Search Console**.

---

## Step 11 — Your own domain (optional)

1. Vercel project → **Settings → Domains → Add**.
2. Enter your domain and follow the DNS instructions Vercel gives you.
3. Once it is live, update `SITE_URL` in Environment Variables **and**
   **Settings → Site → Public site URL** inside BlogForge, then redeploy.

Both matter: one is used at build time, the other drives canonical URLs and the
sitemap.

---

## Important: images on Vercel

Generated images normally get saved to the site's own disk. On Vercel that disk
is read-only, so:

- **Pollinations** (the default) automatically falls back to linking its own
  hosted copy. It works, but the image lives on their servers.
- **For images you fully control,** add **Unsplash** or **Pexels** as your image
  provider in **AI providers**. Both are free, both return hosted URLs, and both
  work perfectly on Vercel.

If you want AI-generated images stored on your own infrastructure, deploy to a
host with a writable disk instead — see the alternatives below.

---

## Alternative: a VPS or your own machine

If you would rather not use serverless, BlogForge runs as an ordinary Node app
with no external database at all:

```bash
git clone https://github.com/<your-username>/blogforge.git
cd blogforge
npm install
npm run setup
npm run build
npm start
```

`npm run setup` generates your `APP_SECRET`. Leave `DATABASE_URL` unset and the
app runs Postgres **in-process** (PGlite) from `./data/pg` — no database server
to install, and the same Postgres your hosted install would use. Point
`DATABASE_URL` at Supabase later and nothing else changes.

`INLINE_SCHEDULER=1` in `.env` runs the scheduler inside the app, so no cron
service is needed.

This is the simpler deployment. Everything stays on one disk: database, images
and all.

---

## Troubleshooting

**The site shows a 500 error after deploying**
Almost always `DATABASE_URL`. Check that it starts with `postgresql://`, that
you replaced `[YOUR-PASSWORD]` with the real password, and that you used the
**pooler** string (port 6543) rather than the direct one. Then look at Vercel →
**Deployments → your deployment → Runtime Logs** for the actual message.

**"too many connections" or "remaining connection slots are reserved"**
You are on a `:5432` connection — either Direct or Session pooler. Switch
`DATABASE_URL` to the Transaction pooler string on port 6543 and redeploy.

**The site was fine and now errors**
Supabase pauses free projects after a week with no activity. Open the Supabase
dashboard and click **Restore project**.

**`/admin/setup` says an account already exists**
Someone already completed setup — go to `/admin/login` instead. If that is not
you and the site is public, change the password immediately.

**Articles are not generating**
Open **Activity** in the dashboard. Failed jobs show the exact provider error.
The usual causes are no text provider configured, or every free tier being
rate-limited at once — which is why adding a second provider matters.

**Nothing publishes on schedule**
Check **Activity** for the last scheduler run. On Vercel Hobby, cron only fires
once a day. Use cron-job.org (Step 9) if you need it more often.

**Images are missing**
Check **AI providers → Test** on your image provider. If Pollinations is
rate-limited, add Unsplash or Pexels as a second provider.

**I lost my admin password**
There is no email reset. In Supabase open **Table editor → users**, delete the
single row, then visit `/admin/setup` again to create a new account. Your posts
are untouched.

---

## Before you apply for AdSense

- Publish 15–25 substantial articles, and read them first
- Confirm **About**, **Contact** and **Privacy Policy** exist under **Pages**
- Leave the AI disclosure enabled — undisclosed automated content is the most
  common rejection reason
- Have your domain verified in Search Console with the sitemap submitted
- Then add your publisher ID under **Settings → AdSense**
