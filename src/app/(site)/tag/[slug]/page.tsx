import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db, tags, postTags, posts, categories } from '@/db';
import { PostCard, Breadcrumbs, type CardPost } from '@/components/site/chrome';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const [tag] = await db.select().from(tags).where(eq(tags.slug, slug));
  if (!tag) return { title: 'Not found', robots: { index: false } };
  return {
    title: `${tag.name} articles`,
    description: `Everything we have published about ${tag.name}.`,
    alternates: { canonical: `/tag/${tag.slug}` },
  };
}

export default async function TagPage({ params }: Props) {
  const { slug } = await params;
  const [tag] = await db.select().from(tags).where(eq(tags.slug, slug));
  if (!tag) notFound();

  const rows = (await db
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
    .from(postTags)
    .innerJoin(posts, eq(posts.id, postTags.postId))
    .leftJoin(categories, eq(categories.id, posts.categoryId))
    .where(and(eq(postTags.tagId, tag.id), eq(posts.status, 'published')))
    .orderBy(desc(posts.publishedAt))
    .limit(48)) as CardPost[];

  return (
    <div className="mx-auto max-w-7xl px-[var(--gutter)] py-10">
      <Breadcrumbs trail={[{ name: 'Home', href: '/' }, { name: 'Blog', href: '/blog' }, { name: tag.name }]} />
      <header className="border-b pb-8" style={{ borderColor: 'var(--line)' }}>
        <p className="eyebrow">Tag</p>
        <h1 className="headline mt-3 text-[clamp(2rem,5vw,3.25rem)]">{tag.name}</h1>
        <p className="mt-3 text-sm" style={{ color: 'var(--ink-3)' }}>
          {rows.length} article{rows.length === 1 ? '' : 's'}
        </p>
      </header>

      <div className="mt-10 grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((p) => (
          <PostCard key={p.id} post={p} />
        ))}
      </div>
    </div>
  );
}
