import Link from 'next/link';
import { SiteHeader, SiteFooter } from '@/components/site/chrome';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Page not found',
  robots: { index: false, follow: true },
};

/**
 * A 404 that keeps the reader on the site. A bare error page is a bounce; the
 * nav and a route back into the archive are worth the extra query.
 */
export default function NotFound() {
  return (
    <div className="site-shell flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <div className="mx-auto max-w-2xl px-[var(--gutter)] py-24 text-center">
          <p className="eyebrow">Error 404</p>
          <h1 className="headline mt-4 text-[clamp(2rem,5vw,3.25rem)]">
            We could not find that page
          </h1>
          <p className="mx-auto mt-5 max-w-md text-lg leading-relaxed" style={{ color: 'var(--ink-2)' }}>
            It may have been moved or renamed. The archive and the search box below
            will both get you back on track.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/blog"
              className="px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              style={{ background: 'var(--brand)' }}
            >
              Browse all articles
            </Link>
            <Link
              href="/"
              className="px-5 py-2.5 text-sm font-semibold underline-offset-4 hover:underline"
              style={{ color: 'var(--ink-2)' }}
            >
              Go to the homepage
            </Link>
          </div>

          <form action="/search" role="search" className="mx-auto mt-10 flex max-w-sm gap-2">
            <label htmlFor="nf-search" className="sr-only">
              Search articles
            </label>
            <input
              id="nf-search"
              name="q"
              type="search"
              placeholder="Search for something else"
              className="flex-1 border-b bg-transparent px-1 py-2 outline-none"
              style={{ borderColor: 'var(--line)', color: 'var(--ink)' }}
            />
            <button type="submit" className="text-sm font-semibold" style={{ color: 'var(--accent-text)' }}>
              Search
            </button>
          </form>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
