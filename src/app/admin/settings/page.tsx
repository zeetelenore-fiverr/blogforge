import { requireUser } from '@/lib/auth';
import { getSettings, isOn } from '@/lib/settings';
import { PageHeader } from '@/components/admin/bits';
import { ActionForm, SubmitButton, Toggle, Tabs, CopyButton } from '@/components/admin/ui';
import { saveSettingsAction, saveProfileAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const user = await requireUser();
  const s = await getSettings();
  const base = (s['site.url'] || '').replace(/\/+$/, '');

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Settings" description="Site identity, SEO defaults, verification tags, analytics and monetisation." />

      <Tabs
        tabs={[
          { id: 'site', label: 'Site', content: <SiteTab s={s} /> },
          { id: 'seo', label: 'SEO', content: <SeoTab s={s} base={base} /> },
          { id: 'scripts', label: 'Header & footer', content: <ScriptsTab s={s} /> },
          { id: 'gsc', label: 'Search Console', content: <GscTab s={s} base={base} /> },
          { id: 'indexing', label: 'Indexing', content: <IndexingTab s={s} /> },
          { id: 'adsense', label: 'AdSense', content: <AdsenseTab s={s} base={base} /> },
          { id: 'generation', label: 'Generation', content: <GenerationTab s={s} /> },
          {
            id: 'profile',
            label: 'Your profile',
            content: <ProfileTab user={user} />,
          },
        ]}
      />
    </div>
  );
}

type S = Record<string, string>;

/* ------------------------------------------------------------------ site */

function SiteTab({ s }: { s: S }) {
  return (
    <ActionForm action={saveSettingsAction} className="card space-y-4 p-5">
      <input type="hidden" name="$booleans" value="" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="site.name" label="Site name" value={s['site.name']} />
        <Field name="site.url" label="Public site URL" value={s['site.url']} hint="No trailing slash. Everything canonical depends on this." />
      </div>
      <Field name="site.tagline" label="Tagline" value={s['site.tagline']} hint="Shown as the homepage headline." />
      <Field
        name="site.description"
        label="Site description"
        value={s['site.description']}
        textarea
        hint="Used as the default meta description and in llms.txt."
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field name="site.logoUrl" label="Logo URL" value={s['site.logoUrl']} />
        <Field name="site.faviconUrl" label="Favicon URL" value={s['site.faviconUrl']} />
        <Field name="site.postsPerPage" label="Posts per page" value={s['site.postsPerPage']} type="number" />
      </div>
      <div className="grid gap-4 sm:grid-cols-4">
        <Field name="site.language" label="Language code" value={s['site.language']} />
        <Field name="site.locale" label="Locale" value={s['site.locale']} />
        <Field name="brand.primary" label="Brand colour" value={s['brand.primary']} type="color" />
        <Field name="brand.accent" label="Accent colour" value={s['brand.accent']} type="color" />
      </div>
      <Field name="site.copyright" label="Footer copyright" value={s['site.copyright']} hint="Leave blank for an automatic © line." />

      <h3 className="border-t border-slate-100 pt-4 text-sm font-semibold text-slate-900">Publisher (used in schema)</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="org.name" label="Organisation name" value={s['org.name']} />
        <Field name="org.logo" label="Organisation logo URL" value={s['org.logo']} />
        <Field name="org.email" label="Contact email" value={s['org.email']} />
        <Field name="org.phone" label="Contact phone" value={s['org.phone']} />
      </div>

      <h3 className="border-t border-slate-100 pt-4 text-sm font-semibold text-slate-900">Social profiles</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="social.twitter" label="X / Twitter URL" value={s['social.twitter']} />
        <Field name="social.facebook" label="Facebook URL" value={s['social.facebook']} />
        <Field name="social.linkedin" label="LinkedIn URL" value={s['social.linkedin']} />
        <Field name="social.youtube" label="YouTube URL" value={s['social.youtube']} />
      </div>

      <SubmitButton pendingLabel="Saving…">Save site settings</SubmitButton>
    </ActionForm>
  );
}

/* ------------------------------------------------------------------- seo */

function SeoTab({ s, base }: { s: S; base: string }) {
  return (
    <ActionForm action={saveSettingsAction} className="card space-y-4 p-5">
      <input
        type="hidden"
        name="$booleans"
        value="seo.noindexSite,seo.rssEnabled,seo.breadcrumbs,seo.autoInternalLinks,llms.enabled"
      />

      <Field
        name="seo.titleTemplate"
        label="Title template"
        value={s['seo.titleTemplate']}
        hint="%s is the page title, %site% is the site name."
      />
      <Field name="seo.homeTitle" label="Homepage title override" value={s['seo.homeTitle']} />
      <Field
        name="seo.metaDescription"
        label="Default meta description"
        value={s['seo.metaDescription']}
        textarea
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="seo.ogImage" label="Default social share image" value={s['seo.ogImage']} />
        <Field name="seo.twitterHandle" label="X / Twitter handle" value={s['seo.twitterHandle']} hint="Including the @." />
      </div>

      <div className="space-y-3 border-t border-slate-100 pt-4">
        <Toggle name="seo.rssEnabled" defaultChecked={isOn(s['seo.rssEnabled'])} label="Publish an RSS feed" hint={`${base}/feed.xml`} />
        <Toggle name="llms.enabled" defaultChecked={isOn(s['llms.enabled'])} label="Publish llms.txt" hint={`${base}/llms.txt — tells AI crawlers what this site covers.`} />
        <Toggle name="seo.breadcrumbs" defaultChecked={isOn(s['seo.breadcrumbs'])} label="Show breadcrumbs" hint="Also emits BreadcrumbList schema." />
        <Toggle
          name="seo.autoInternalLinks"
          defaultChecked={isOn(s['seo.autoInternalLinks'])}
          label="Automatic internal linking on new posts"
        />
        <Toggle
          name="seo.noindexSite"
          defaultChecked={isOn(s['seo.noindexSite'])}
          label="Discourage search engines from indexing this site"
          hint="Blocks everything via robots.txt and a noindex header. Use while you are still filling the blog."
        />
      </div>

      <div className="border-t border-slate-100 pt-4">
        <h3 className="text-sm font-semibold text-slate-900">Site verification</h3>
        <p className="mb-3 text-xs text-slate-500">
          Paste just the content value from each provider&rsquo;s meta tag — BlogForge renders the tag itself.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="verify.google" label="Google" value={s['verify.google']} />
          <Field name="verify.bing" label="Bing" value={s['verify.bing']} />
          <Field name="verify.yandex" label="Yandex" value={s['verify.yandex']} />
          <Field name="verify.pinterest" label="Pinterest" value={s['verify.pinterest']} />
        </div>
      </div>

      <div className="border-t border-slate-100 pt-4">
        <h3 className="text-sm font-semibold text-slate-900">robots.txt and llms.txt</h3>
        <Field
          name="robots.custom"
          label="Extra robots.txt rules"
          value={s['robots.custom']}
          textarea
          rows={4}
          hint="Appended to the generated file."
        />
        <Field
          name="llms.custom"
          label="Extra llms.txt content"
          value={s['llms.custom']}
          textarea
          rows={4}
        />
      </div>

      <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
        <p className="font-semibold text-slate-800">Generated files</p>
        <ul className="mt-1.5 space-y-1">
          {['/sitemap.xml', '/robots.txt', '/llms.txt', '/feed.xml', '/ads.txt'].map((path) => (
            <li key={path} className="flex items-center gap-2">
              <a href={path} target="_blank" rel="noopener" className="font-mono text-blue-600 hover:underline">
                {base}
                {path}
              </a>
            </li>
          ))}
        </ul>
      </div>

      <SubmitButton pendingLabel="Saving…">Save SEO settings</SubmitButton>
    </ActionForm>
  );
}

/* --------------------------------------------------------------- scripts */

function ScriptsTab({ s }: { s: S }) {
  return (
    <ActionForm action={saveSettingsAction} className="card space-y-4 p-5">
      <input type="hidden" name="$booleans" value="" />
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        Anything you paste here runs on every public page. Only add code you trust — this is the same power a theme
        editor gives you, with the same consequences.
      </div>

      <Field
        name="scripts.head"
        label="Head — before </head>"
        value={s['scripts.head']}
        textarea
        rows={8}
        mono
        hint="Verification meta tags, preconnects, custom analytics. meta/link/script tags are parsed and placed in the document head."
      />
      <Field
        name="scripts.bodyStart"
        label="Body — right after <body>"
        value={s['scripts.bodyStart']}
        textarea
        rows={5}
        mono
        hint="Noscript pixels, tag manager fallbacks."
      />
      <Field
        name="scripts.bodyEnd"
        label="Body — before </body>"
        value={s['scripts.bodyEnd']}
        textarea
        rows={5}
        mono
        hint="Chat widgets, deferred scripts."
      />

      <h3 className="border-t border-slate-100 pt-4 text-sm font-semibold text-slate-900">Analytics shortcuts</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="analytics.ga4" label="Google Analytics 4 ID" value={s['analytics.ga4']} hint="G-XXXXXXXXXX" />
        <Field name="analytics.gtm" label="Google Tag Manager ID" value={s['analytics.gtm']} hint="GTM-XXXXXXX" />
      </div>

      <SubmitButton pendingLabel="Saving…">Save scripts</SubmitButton>
    </ActionForm>
  );
}

/* ------------------------------------------------------------------- gsc */

function GscTab({ s, base }: { s: S; base: string }) {
  return (
    <ActionForm action={saveSettingsAction} className="card space-y-4 p-5">
      <input type="hidden" name="$booleans" value="gsc.indexingApi" />

      <div className="rounded-lg bg-blue-50 px-3 py-2.5 text-xs text-blue-900">
        <p className="font-semibold">How to connect (free)</p>
        <ol className="mt-1.5 list-decimal space-y-1 pl-4">
          <li>In Google Cloud, enable the <strong>Search Console API</strong> and create a service account.</li>
          <li>Create a JSON key for it and open the file.</li>
          <li>Copy <code>client_email</code> and <code>private_key</code> into the fields below.</li>
          <li>
            In Search Console → Settings → Users and permissions, add that <code>client_email</code> as a
            <strong> Full</strong> user.
          </li>
        </ol>
      </div>

      <Field
        name="gsc.siteUrl"
        label="Property URL"
        value={s['gsc.siteUrl']}
        hint={`Exactly as it appears in Search Console — usually ${base}/ or sc-domain:yourdomain.com`}
      />
      <Field name="gsc.clientEmail" label="Service account email" value={s['gsc.clientEmail']} mono />
      <Field
        name="gsc.privateKey"
        label="Private key"
        value={s['gsc.privateKey']}
        textarea
        rows={6}
        mono
        hint="Paste the whole -----BEGIN PRIVATE KEY----- block. Stored as written; keep your database file private."
      />

      <p className="text-xs text-slate-500">
        Once connected, the Indexing page reads real coverage verdicts (&ldquo;Crawled — currently not indexed&rdquo;
        and friends) per URL and feeds them to the auto-fixer.
      </p>

      <SubmitButton pendingLabel="Saving…">Save Search Console settings</SubmitButton>
    </ActionForm>
  );
}

/* --------------------------------------------------------------- adsense */

function AdsenseTab({ s, base }: { s: S; base: string }) {
  return (
    <ActionForm action={saveSettingsAction} className="card space-y-4 p-5">
      <input
        type="hidden"
        name="$booleans"
        value="adsense.enabled,adsense.autoAds,policy.enabled,policy.aiReview,policy.blockPublish"
      />

      <Toggle
        name="adsense.enabled"
        defaultChecked={isOn(s['adsense.enabled'])}
        label="Enable AdSense"
        hint="Loads the AdSense script and serves ads.txt."
      />
      <Field
        name="adsense.client"
        label="Publisher ID"
        value={s['adsense.client']}
        mono
        hint="ca-pub-XXXXXXXXXXXXXXXX"
      />
      <Toggle name="adsense.autoAds" defaultChecked={isOn(s['adsense.autoAds'])} label="Auto ads" hint="Let Google place ads automatically in addition to the manual slots below." />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="adsense.slotInArticle" label="In-article slot ID" value={s['adsense.slotInArticle']} mono />
        <Field name="adsense.slotSidebar" label="Sidebar slot ID" value={s['adsense.slotSidebar']} mono />
      </div>

      <Field
        name="adsense.adsTxt"
        label="Custom ads.txt"
        value={s['adsense.adsTxt']}
        textarea
        rows={4}
        mono
        hint={`Leave blank to serve the standard Google line automatically at ${base}/ads.txt`}
      />

      <h3 className="border-t border-slate-100 pt-4 text-sm font-semibold text-slate-900">
        Policy screening
      </h3>
      <p className="-mt-1 text-xs text-slate-500">
        Every article is checked against Google&rsquo;s programme policies as it is written —
        restricted subject matter, thin pages, unsupported health or financial claims, and the
        scaled-content pattern that AI publishing falls into. Results appear under{' '}
        <a href="/admin/policy" className="font-medium text-blue-600 hover:underline">
          AdSense policy
        </a>
        .
      </p>
      <div className="space-y-3">
        <Toggle
          name="policy.enabled"
          defaultChecked={isOn(s['policy.enabled'])}
          label="Screen every article as it is written"
          hint="Local, instant and free. No API call."
        />
        <Toggle
          name="policy.blockPublish"
          defaultChecked={isOn(s['policy.blockPublish'])}
          label="Hold back articles with a blocking issue"
          hint="Keeps them as drafts instead of publishing. Strongly recommended if a campaign publishes automatically."
        />
        <Toggle
          name="policy.aiReview"
          defaultChecked={isOn(s['policy.aiReview'])}
          label="Add a model review on top"
          hint="Catches judgement calls the term list cannot. Costs one extra AI call per article and can only raise a verdict, never lower it."
        />
      </div>

      <div className="rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
        <p className="font-semibold text-slate-800">Before you apply</p>
        <ul className="mt-1.5 list-disc space-y-1 pl-4">
          <li>Publish 15–25 substantial articles, not thin ones.</li>
          <li>Have About, Contact and Privacy Policy pages live — check the Pages screen.</li>
          <li>Keep the AI disclosure visible; undisclosed mass-produced content is what reviewers reject.</li>
          <li>Make sure your domain is verified in Search Console and the sitemap is submitted.</li>
        </ul>
      </div>

      <SubmitButton pendingLabel="Saving…">Save AdSense settings</SubmitButton>
    </ActionForm>
  );
}

/* -------------------------------------------------------------- indexing */

function IndexingTab({ s }: { s: S }) {
  return (
    <ActionForm action={saveSettingsAction} className="card space-y-4 p-5">
      <input type="hidden" name="$booleans" value="indexing.autoCheck,indexing.autoFix" />

      <p className="text-xs text-slate-500">
        BlogForge can watch its own pages: check whether Google has indexed each one, diagnose why
        not, and repair the on-page causes it can. Results appear under{' '}
        <a href="/admin/indexing" className="font-medium text-blue-600 hover:underline">
          Indexing
        </a>
        .
      </p>

      <div className="space-y-3">
        <Toggle
          name="indexing.autoCheck"
          defaultChecked={isOn(s['indexing.autoCheck'])}
          label="Check indexing automatically"
          hint="The scheduler queues checks for the pages that have gone longest without one."
        />
        <Toggle
          name="indexing.autoFix"
          defaultChecked={isOn(s['indexing.autoFix'])}
          label="Resolve issues automatically"
          hint="Clears stray noindex flags, builds internal links in and out, and asks the model to close the content gaps behind a not-indexed verdict. Every change is recorded and shown back to you."
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          name="indexing.intervalHours"
          label="Re-check each page every"
          value={s['indexing.intervalHours']}
          type="number"
          hint="Hours. Daily is plenty — Google does not re-crawl faster than that."
        />
        <Field
          name="indexing.batchSize"
          label="Pages per scheduler run"
          value={s['indexing.batchSize']}
          type="number"
          hint="Keeps a large site from exhausting the Search Console quota in one go."
        />
      </div>

      <div className="rounded-lg bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
        <p className="font-semibold">Automatic fixing edits your published articles.</p>
        <p className="mt-1">
          It only ever adds — a rewritten intro, a new section, tightened metadata, extra internal
          links. Nothing is deleted, and every change is listed on the Indexing page. Leave it off
          until you have read a few fixes and are happy with them.
        </p>
      </div>

      <SubmitButton pendingLabel="Saving…">Save indexing settings</SubmitButton>
    </ActionForm>
  );
}

/* ------------------------------------------------------------ generation */

function GenerationTab({ s }: { s: S }) {
  return (
    <ActionForm action={saveSettingsAction} className="card space-y-4 p-5">
      <input type="hidden" name="$booleans" value="gen.disclosure" />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="gen.defaultWordCount" label="Default article length" value={s['gen.defaultWordCount']} type="number" />
        <Field name="gen.imageStyle" label="Default image style" value={s['gen.imageStyle']} />
      </div>

      <Field
        name="gen.defaultPrompt"
        label="Default writing prompt"
        value={s['gen.defaultPrompt']}
        textarea
        rows={12}
        mono
        hint="Leave blank to use the built-in prompt. Campaigns can override this individually."
      />

      <div className="space-y-3 border-t border-slate-100 pt-4">
        <Toggle
          name="gen.disclosure"
          defaultChecked={isOn(s['gen.disclosure'])}
          label="Show an AI disclosure on articles"
          hint="Strongly recommended. Google's guidance is about quality, not authorship — but undisclosed automation is what gets sites penalised and AdSense applications rejected."
        />
        <Field name="gen.disclosureText" label="Disclosure wording" value={s['gen.disclosureText']} textarea rows={2} />
      </div>

      <SubmitButton pendingLabel="Saving…">Save generation settings</SubmitButton>
    </ActionForm>
  );
}

/* --------------------------------------------------------------- profile */

function ProfileTab({ user }: { user: { name: string; slug: string; bio: string | null; avatarUrl: string | null; email: string } }) {
  return (
    <ActionForm action={saveProfileAction} className="card space-y-4 p-5">
      <p className="text-xs text-slate-500">
        This is the byline on every article. A real name and a specific bio do more for E-E-A-T than any technical
        tweak on this page.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="name" label="Display name" value={user.name} />
        <Field name="slug" label="Author page slug" value={user.slug} mono />
      </div>
      <Field name="bio" label="Bio" value={user.bio || ''} textarea rows={3} />
      <Field name="avatarUrl" label="Avatar URL" value={user.avatarUrl || ''} />

      <div className="border-t border-slate-100 pt-4">
        <label className="label" htmlFor="password">
          New password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          className="field"
          placeholder="Leave blank to keep the current one"
        />
        <p className="hint">Minimum 8 characters. Signed in as {user.email}.</p>
      </div>

      <SubmitButton pendingLabel="Saving…">Save profile</SubmitButton>
    </ActionForm>
  );
}

/* --------------------------------------------------------------- helpers */

function Field({
  name,
  label,
  value,
  hint,
  textarea,
  rows = 3,
  type = 'text',
  mono,
}: {
  name: string;
  label: string;
  value: string;
  hint?: string;
  textarea?: boolean;
  rows?: number;
  type?: string;
  mono?: boolean;
}) {
  const cls = `field${mono ? ' font-mono text-xs' : ''}`;
  return (
    <div>
      <label className="label" htmlFor={name}>
        {label}
      </label>
      {textarea ? (
        <textarea id={name} name={name} rows={rows} defaultValue={value} className={cls} />
      ) : (
        <input id={name} name={name} type={type} defaultValue={value} className={cls} />
      )}
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}
