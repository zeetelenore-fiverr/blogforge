import type { Metadata, Viewport } from 'next';
import './globals.css';
import { getSettingsForRender, isOn } from '@/lib/settings';

// Font families come from globals.css rather than next/font. next/font is the
// nicer default -- self-hosted, no render-blocking request, no layout shift --
// but it is the one thing every page loads and no route handler touches, and on
// Vercel every page was timing out while route handlers served fine. Keeping the
// stack in CSS removes that variable; the editorial pairing degrades to the
// closest system faces.

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSettingsForRender();
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
    // Always emit an icon link. Without one the browser falls back to
    // /favicon.ico, which does not exist, so every page load logged a 404 and a
    // fresh install showed a blank tab. Operators override it in Settings.
    icons: { icon: s['site.faviconUrl'] || '/icon.svg' },
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
  const s = await getSettingsForRender();
  return (
    <html
      lang={s['site.language'] || 'en'}
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
