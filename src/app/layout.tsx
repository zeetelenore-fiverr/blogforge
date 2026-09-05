import type { Metadata, Viewport } from 'next';
import { Libre_Bodoni, Public_Sans } from 'next/font/google';
import './globals.css';
import { getSettings, isOn } from '@/lib/settings';

// Editorial pairing: a Bodoni for display, a neutral grotesque for reading.
// Self-hosted by next/font, so there is no render-blocking request and no CLS.
const display = Libre_Bodoni({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-libre-bodoni',
  display: 'swap',
  fallback: ['Iowan Old Style', 'Georgia', 'serif'],
});

const body = Public_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-public-sans',
  display: 'swap',
  fallback: ['system-ui', 'Segoe UI', 'sans-serif'],
});

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSettings();
  const base = (s['site.url'] || 'http://localhost:3000').replace(/\/+$/, '');

  return {
    metadataBase: new URL(base),
    title: {
      default: s['seo.homeTitle'] || `${s['site.name']} — ${s['site.tagline']}`,
      template: s['seo.titleTemplate'].replace('%site%', s['site.name']),
    },
    description: s['seo.metaDescription'] || s['site.description'],
    applicationName: s['site.name'],
    generator: 'BlogForge',
    robots: isOn(s['seo.noindexSite'])
      ? { index: false, follow: false }
      : { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1, 'max-video-preview': -1 },
    alternates: {
      canonical: '/',
      types: isOn(s['seo.rssEnabled']) ? { 'application/rss+xml': `${base}/feed.xml` } : undefined,
    },
    openGraph: {
      type: 'website',
      siteName: s['site.name'],
      locale: s['site.locale'],
      url: base,
      title: s['seo.homeTitle'] || `${s['site.name']} — ${s['site.tagline']}`,
      description: s['seo.metaDescription'] || s['site.description'],
      ...(s['seo.ogImage'] ? { images: [{ url: s['seo.ogImage'] }] } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      ...(s['seo.twitterHandle'] ? { site: s['seo.twitterHandle'], creator: s['seo.twitterHandle'] } : {}),
    },
    verification: {
      ...(s['verify.google'] ? { google: s['verify.google'] } : {}),
      ...(s['verify.yandex'] ? { yandex: s['verify.yandex'] } : {}),
      other: {
        ...(s['verify.bing'] ? { 'msvalidate.01': s['verify.bing'] } : {}),
        ...(s['verify.pinterest'] ? { 'p:domain_verify': s['verify.pinterest'] } : {}),
      },
    },
    icons: s['site.faviconUrl'] ? { icon: s['site.faviconUrl'] } : undefined,
  };
}

// Every route here reads the database (settings, posts, session), so nothing is
// meaningfully static. Declaring it stops Next trying to prerender /_not-found
// at build time, which would require a live database just to compile.
export const dynamic = 'force-dynamic';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const s = await getSettings();
  return (
    <html
      lang={s['site.language'] || 'en'}
      className={`${display.variable} ${body.variable}`}
      suppressHydrationWarning
    >
      <body
        style={
          {
            '--brand': s['brand.primary'],
            '--accent': s['brand.accent'],
          } as React.CSSProperties
        }
      >
        {children}
      </body>
    </html>
  );
}
