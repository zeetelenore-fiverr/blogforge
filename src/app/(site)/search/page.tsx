import type { Metadata } from 'next';
import Link from 'next/link';
import { and, desc, eq, like, or, sql } from 'drizzle-orm';
import { db, posts, categories } from '@/db';
import { PostCard, Breadcrumbs, type CardPost } from '@/components/site/chrome';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ q?: string }> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { q } = await searchParams;
  return {
    title: q ? `Search: ${q}` : 'Search',
    // Search result pages are thin and near-duplicate — keep them out of the index.
    robots: { index: false, follow: true },
  };
}

export default async function SearchPage({ searchParams }: Props) {
  const { q } = await searchParams;
  const query = (q || '').trim();
  let results: CardPost[] = [];

  if (query.length >= 2) {
    const needle = `%${query.replace(/[%_]/g, '')}%`;
    results = (await db
      .select({
        id: posts.id,
        title: posts.title,
        slug: posts.slug,
        excerpt: posts.excerpt,
        featuredImage: posts.featuredImage,
        featuredImageAlt: posts.featuredImageAlt,
        publishedAt: posts.publishedAt,
        readingTime: posts.readingTime,
        categoryName: categories.name,
        categorySlug: categories.slug,
      })
      .from(posts)
      .leftJoin(categories, eq(categories.id, posts.categoryId))
      .where(
        and(
          eq(posts.status, 'published'),
          or(
            like(posts.title, needle),
            like(posts.excerpt, needle),
            like(posts.focusKeyword, needle),
            like(posts.contentMd, needle),
          ),
        ),
      )
      // Title matches first, then recency.
      .orderBy(sql`CASE WHEN ${posts.title} LIKE ${needle} THEN 0 ELSE 1 END`, desc(posts.publishedAt))
      .limit(30)) as CardPost[];
  }

  return (
    <div className="mx-auto max-w-7xl px-[var(--gutter)] py-10">
      <Breadcrumbs trail={[{ name: 'Home', href: '/' }, { name: 'Search' }]} />
      <h1 className="headline text-[clamp(2rem,5vw,3rem)]">Search</h1>

      <form action="/search" role="search" className="mt-5 flex max-w-xl gap-2">
        <label htmlFor="q" className="sr-only">
          Search articles
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={query}
          placeholder="What are you looking for?"
          className="flex-1 border-b bg-transparent px-1 py-2 text-lg outline-none"
          style={{ borderColor: 'var(--line)', color: 'var(--ink)' }}
          autoFocus
        />
        <button
          type="submit"
          className="px-5 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: 'var(--brand)' }}
        >
          Search
        </button>
      </form>

      {query.length >= 2 && (
        <p className="mt-6 text-sm" style={{ color: 'var(--ink-2)' }}>
          {results.length} result{results.length === 1 ? '' : 's'} for <strong>“{query}”</strong>
        </p>
      )}

      {results.length > 0 && (
        <div className="mt-8 grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((p) => (
            <PostCard key={p.id} post={p} />
          ))}
        </div>
      )}

      {query.length >= 2 && results.length === 0 && (
        <div className="mt-10 py-16 text-center">
          <p className="text-sm" style={{ color: 'var(--ink-2)' }}>
            Nothing matched that. Try a broader phrase, or{' '}
            <Link href="/blog" className="font-medium hover:underline" style={{ color: 'var(--accent-text)' }}>
              browse every article
            </Link>
            .
          </p>
        </div>
      )}
    </div>
  );
}
