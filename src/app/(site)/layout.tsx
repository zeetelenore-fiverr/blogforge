import { SiteHeader, SiteFooter } from '@/components/site/chrome';
import { RawTags } from '@/lib/head-tags';
import { getSettings, isOn } from '@/lib/settings';
import { startInlineScheduler } from '@/engine/scheduler';

// Boot the in-process scheduler once, on the first server render, when the
// operator has opted into it. Serverless installs leave it off and drive
// /api/cron/tick from Vercel Cron or any free cron service instead.
if (process.env.INLINE_SCHEDULER === '1' && typeof window === 'undefined') {
  startInlineScheduler(60_000);
}

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const s = await getSettings();
  const ga = s['analytics.ga4'];
  const gtm = s['analytics.gtm'];
  const adsClient = s['adsense.client'];
  const adsOn = isOn(s['adsense.enabled']) && !!adsClient;

  return (
    <>
      {/* operator-pasted head HTML: verification tags, custom meta, scripts */}
      <RawTags html={s['scripts.head']} keyPrefix="head" />

      {gtm && (
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${gtm}');`,
          }}
        />
      )}
      {ga && (
        <>
          <script async src={`https://www.googletagmanager.com/gtag/js?id=${ga}`} />
          <script
            dangerouslySetInnerHTML={{
              __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${ga}');`,
            }}
          />
        </>
      )}
      {adsOn && (
        <script
          async
          crossOrigin="anonymous"
          src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsClient}`}
        />
      )}

      <a href="#main" className="skip-link">
        Skip to content
      </a>

      {gtm && (
        <noscript>
          <iframe
            src={`https://www.googletagmanager.com/ns.html?id=${gtm}`}
            height="0"
            width="0"
            style={{ display: 'none', visibility: 'hidden' }}
            title="Google Tag Manager"
          />
        </noscript>
      )}
      <RawTags html={s['scripts.bodyStart']} keyPrefix="bodystart" />

      <div className="site-shell flex min-h-screen flex-col">
        <SiteHeader />
        <main id="main" className="flex-1">
          {children}
        </main>
        <SiteFooter />
      </div>

      <RawTags html={s['scripts.bodyEnd']} keyPrefix="bodyend" />
    </>
  );
}
