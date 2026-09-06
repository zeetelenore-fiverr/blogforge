# Getting your blog online — the plain-English guide

This guide assumes you have **never written code** and have never used any of the
tools involved. Every step is something you click or paste. There is no
programming, and nothing to install on your computer.

**Time:** about 30 minutes, most of it waiting.
**Cost:** nothing. Everything used here is free, and none of it asks for a card.

If you get stuck, jump to **"When something looks wrong"** near the bottom.

---

## What you will have at the end

A real website with your own blog on it, plus a private control panel where you
can press a button and have an article written, illustrated and published for
you — on a schedule you choose.

---

## Before you begin: fill this in as you go

You will be given four pieces of text along the way. Keep them somewhere safe —
a notes app or a piece of paper. You will need them all in Part 5.

| # | What it is | Where you get it | Write it here |
| --- | --- | --- | --- |
| 1 | Database connection string | Part 3 | |
| 2 | Secret key | Part 4 | |
| 3 | Second secret key | Part 4 | |
| 4 | Your website address | Part 5 | |

> **A note on pasting.** These are long strings of random characters. Always
> copy them with the copy button where one exists, and paste them straight in.
> Do not retype them, and do not let your phone add a space at the end.

---

## Part 1 — Create three free accounts

Three companies each do one job for you. Sign up for all three now; it makes the
rest go faster.

### GitHub — this stores the blog software

Think of it as Google Drive, but for the files that make a website work.

Go to **[github.com/signup](https://github.com/signup)** and create an account.
Use an email you check.

### Vercel — this runs your website

This is the company that actually puts your blog on the internet.

Go to **[vercel.com/signup](https://vercel.com/signup)**. When it asks how you
want to sign up, choose **"Continue with GitHub"** — this connects the two
accounts automatically, which you need.

### Supabase — this remembers your articles

A database: the filing cabinet where your posts and settings are recorded.

Go to **[supabase.com](https://supabase.com)** and sign in with GitHub again.

> **Why not just keep the articles on the website?** Vercel's servers wipe
> themselves clean constantly — that is how they stay fast and free. Anything
> saved there would vanish. Supabase is a filing cabinet that stays put.

---

## Part 2 — Make your own copy of the software

1. Open the BlogForge page on GitHub.
2. Near the top right, find the button labelled **Fork** and click it.
3. On the next screen, click **Create fork**.

Wait a few seconds. You now have your own private copy — the address will look
like `github.com/yourname/blogforge`.

*"Fork" just means "make me my own copy." Changes you make never affect anyone
else's.*

### If you were sent a ZIP file instead of a link

1. Unzip the file on your computer.
2. Go to **[github.com/new](https://github.com/new)**, type `blogforge` as the
   name, and click **Create repository**.
3. On the page that appears, click the link **"uploading an existing file"**.
4. Drag everything from inside the unzipped folder into the browser window.
5. Scroll down and click **Commit changes**.

If you see a folder called `node_modules`, do not upload it — it is huge and not
needed.

---

## Part 3 — Create your database

1. Go to **[supabase.com/dashboard](https://supabase.com/dashboard)** and click
   **New project**.
2. Name it `blogforge`. It asks you to choose a **database password** — make one
   up, and write it down. You need it in a moment.
3. Pick the region closest to where most of your readers will be, then create.
   It takes a minute or two to finish setting up.
4. When it is ready, find the **Connect** button near the top of the page and
   click it.
5. You will see several connection strings. Choose the one labelled
   **Transaction pooler**. It looks like this:

   ```
   postgresql://postgres.abcdefgh:[YOUR-PASSWORD]@aws-0-eu-west-2.pooler.supabase.com:6543/postgres
   ```

6. Copy it, then replace the `[YOUR-PASSWORD]` part — square brackets and all —
   with the password you chose in step 2.
   → This finished line is **#1** on your worksheet.

> **Pick the "Transaction pooler" one specifically** — the address ends in
> `:6543`. The other options on that screen end in `:5432`; they will run out
> of connections and the site will start erroring.

**You do not need to set anything up inside the database.** No tables, no
columns, no SQL. The blog builds all of that by itself the first time it runs.

---

## Part 4 — Make two secret keys

Your blog needs two random passwords that only it knows. One protects the API
keys you will store later; the other stops strangers triggering your publishing
schedule.

1. Open **[this link](https://www.random.org/strings/?num=2&len=32&digits=on&upperalpha=on&loweralpha=on&unique=on&format=html&rnd=new)**.
2. It shows two lines of 32 random characters.
3. Copy the first line → this is **#2** on your worksheet.
4. Copy the second line → this is **#3** on your worksheet.

> **Keep #2 safe.** If you ever change it, every AI key you have saved becomes
> unreadable and has to be entered again. It is not a disaster, just annoying.

---

## Part 5 — Put your blog on the internet

1. Go to **[vercel.com/new](https://vercel.com/new)**.
2. You should see a list of your GitHub projects. Find **blogforge** and click
   **Import** next to it.
3. Leave every setting exactly as it is. Do not change the framework, the folder,
   or the build commands.
4. Look for a section called **Environment Variables** and click to expand it.

Now add three entries. For each one, type the name in the left box, paste the
value in the right box, and click **Add**.

| Name (type this exactly) | Value (paste this) |
| --- | --- |
| `APP_SECRET` | Your **#2** |
| `DATABASE_URL` | Your **#1** |
| `CRON_SECRET` | Your **#3** |

Check the names carefully — they are case-sensitive, and a typo here is the most
common reason this step fails.

5. Click **Deploy**.

Now wait. The first build takes two to four minutes and you will see a lot of
scrolling text. That is normal — you do not need to read it.

When it finishes you will see a congratulations screen with your website address,
something like `https://blogforge-abc123.vercel.app`.

→ That address is **#4** on your worksheet.

---

## Part 6 — Tell the blog its own address

Vercel only decided your address a moment ago, so the blog does not know it yet.
It needs to, or links and Google listings will point to the wrong place.

1. In your Vercel project, click **Settings**, then **Environment Variables**.
2. Add one more entry:
   - Name: `SITE_URL`
   - Value: your **#4**, with no slash on the end
3. Click **Save**.
4. Click the **Deployments** tab at the top.
5. On the newest entry in the list, click the **⋯** button on the right and
   choose **Redeploy**. Confirm.

Wait another two minutes.

---

## Part 7 — Create your login

1. In your browser, go to your website address followed by `/admin/setup`
   — for example `https://blogforge-abc123.vercel.app/admin/setup`
2. Fill in your name, your email, and a password of at least 8 characters. Use a
   real password and save it in your password manager.
3. In the site address box, paste your **#4** again.
4. Click **Create account and finish**.

You should land on a dashboard. **You are now running your own blog.**

That setup page will never appear again — it only works while no account exists.

---

## Part 8 — Give it the ability to write

Right now your blog can do everything except write. That needs one free key from
Google.

1. Open **[aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)**
   and sign in with any Google account.
2. Click **Create API key**. Choose a project if it asks — any is fine.
3. Copy the key it gives you. No payment details are requested at any point.
4. Back in your blog dashboard, click **AI providers** in the left menu.
5. Click **+ Add text generation provider**.
6. Leave **Google Gemini** selected in the dropdown, paste your key into the API
   key box, and click **Add provider**.
7. On the row that appears, click **Test**. You want to see **"Responded: OK"**.

Pictures already work with no key at all — that is set up for you.

### Strongly recommended: add a second one

Free services get busy and temporarily stop answering. When that happens your
blog simply uses the next one on the list instead of failing. It takes a minute:

- **[Groq](https://console.groq.com/keys)** — sign in, create a key, add it the
  same way (choose "Groq Cloud" in the dropdown)
- **[OpenRouter](https://openrouter.ai/keys)** — same idea

---

## Part 9 — See what it looks like with articles in it

Before writing anything of your own, load the examples.

1. Click **Posts** in the left menu.
2. Click **Load sample articles**.
3. Wait about a minute while it draws six pictures.
4. Click **View site ↗** at the top left.

You now have a working blog with six articles, photographs, categories and
working links between the posts. Each article carries a main photograph plus two
more inside the text — that happens automatically for everything you publish.

> **These samples are about coffee**, which is almost certainly not your topic.
> They exist so you can see the design working. Delete them whenever you like:
> **Posts** → tick the boxes → **Delete**.

---

## Part 10 — Make it write about your topic

### First, find out what people search for

1. Click **Keywords** in the left menu.
2. In **Research a topic**, type your subject — for example `indoor plants`.
3. Optionally add a sentence of context, like "a blog for beginners keeping
   houseplants alive".
4. Click **Research keywords** and wait about twenty seconds.

You will get a list of things people genuinely type into Google, with an
easiness score. Low numbers are easier to rank for. This costs nothing and needs
no key.

### Then set up automatic publishing

1. Click **Campaigns**, then **New campaign**.
2. Give it a name, like "Houseplant guides".
3. In the keywords box, paste a few topics — one per line.
4. Choose how often to publish. **Once a day** is the right answer for a new
   blog. Publishing faster does not help and can hurt.
5. Set **Publish as** to **Draft — review first**.
6. Set the status to **Active** and save.
7. Click **Run once now**, wait a minute, then check **Posts**.

**Read the first few articles yourself.** Only switch the campaign to publish
automatically once you are happy with what it writes. This is the single most
important piece of advice in this guide.

---

## Part 11 — Tell Google your blog exists

Without this, Google may take weeks to notice you.

1. Go to **[search.google.com/search-console](https://search.google.com/search-console)**.
2. Choose **URL prefix** and paste your website address.
3. Choose the **HTML tag** verification method. It shows you a line of code —
   you only need the part inside the quotes after `content=`.
4. In your blog: **Settings** → **SEO** tab → scroll to **Site verification** →
   paste it into the **Google** box → **Save SEO settings**.
5. Back in Google, click **Verify**.
6. Once verified, click **Sitemaps** in Google's left menu and submit:
   `sitemap.xml`

---

## Turning on the automatic schedule

Your campaign will not run on its own until something wakes the website up
regularly.

Vercel does this for you already — but on the free plan it only happens **once a
day**, at a time Vercel chooses. For one article a day, that is all you need, and
there is nothing to do.

**If you want it to run more often**, use a free scheduling service:

1. Sign up at **[cron-job.org](https://cron-job.org)**.
2. Create a job with this address, replacing both placeholder parts:
   `https://YOUR-SITE.vercel.app/api/cron/tick?secret=YOUR-NUMBER-3`
3. Set it to run every 15 minutes.

---

## Where everything lives

| I want to… | Go to |
| --- | --- |
| See how things are going | **Overview** |
| Read, edit or delete articles | **Posts** — the editor works like a word processor |
| Change what gets written and when | **Campaigns** |
| Find new topics | **Keywords** |
| See charts of how everything is going | **Reports** |
| See which articles need work | **SEO checker** |
| Find out why Google is ignoring a page | **Indexing** |
| Check articles against AdSense rules | **AdSense policy** — with a **Fix issues** button |
| Change the site name, colours, logo | **Settings → Site** |
| Edit the About or Contact page | **Pages** |
| Add or change AI keys | **AI providers** |
| See what happened and when | **Activity** |

---

## When something looks wrong

**The website shows an error page after deploying**
Almost always the database line. Go to Vercel → Settings → Environment Variables
and check `DATABASE_URL`: it must start with `postgresql://`, must have your real
password in place of `[YOUR-PASSWORD]`, and must be the **Transaction pooler**
one with `6543` in it. Fix it, then redeploy (Part 6, steps 4-5).

**The site worked and now shows an error**
Supabase puts free projects to sleep after a week with no visitors. Open your
Supabase dashboard and click **Restore project**. It wakes up in a minute.

**"An account already exists" on the setup page**
Setup was already completed. Go to `/admin/login` instead. If that was not you
and your site is public, change your password immediately in **Settings → Your
profile**.

**Nothing is being written**
Click **Activity**. Failed jobs show the real reason in plain text. The usual
causes are no AI key added, or all your free services being busy at once — which
is exactly why Part 8 suggests adding a second one.

**Articles are written but never appear on the site**
They are probably drafts. Open **Posts**, and check the **Drafts** tab. Change a
campaign's **Publish as** setting to publish them automatically.

**Nothing publishes on schedule**
Check **Activity** for the last scheduler run. On Vercel's free plan this only
happens once a day. Set up cron-job.org if you need it sooner.

**Pictures are missing**
Go to **AI providers** and click **Test** on your image provider. If it is busy,
add **Unsplash** or **Pexels** as a second one — both are free and both work
especially well on Vercel.

**I forgot my password**
There is no "forgot password" email. Open your Supabase dashboard, click **Table
Editor**, open the `users` table, delete the single row in it, then go back to
`/admin/setup` and create a new account. Your articles are not affected.

---

## Words you will see, explained

**Deploy** — put the website online, or update it after a change.

**Environment variable** — a setting you give the website that is too private to
put in the code, like a password.

**Repository (repo)** — the folder holding the website's files on GitHub.

**Fork** — your own copy of someone else's repository.

**API key** — a password that lets your blog use another company's service.

**Draft** — an article that exists but is not visible to the public yet.

**Indexing** — Google having read your page and being willing to show it in
search results. A page can exist and still not be indexed.

**Sitemap** — a list of all your pages, written for search engines. Yours is
made automatically.

**Schema markup** — extra hidden information that helps Google understand what a
page is about. Also automatic.

**Cron** — a timer that runs something on a schedule.

---

## Before you apply to Google AdSense

Advertising approval is not automatic and thin sites get rejected. Give yourself
the best chance:

- Publish **15–25 real articles** and read them. Quantity alone fails.
- Check **Pages** — About, Contact and Privacy Policy must all be live.
- Leave the AI disclosure switched on (**Settings → Generation**). Hiding it is
  one of the most common reasons applications are refused.
- Have your site verified in Search Console with the sitemap submitted.
- Then add your publisher ID in **Settings → AdSense**.

Apply when the blog looks like something a person would want to read. That is
the actual test.
