import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db, categories } from '@/db';
import { listPosts, PostCard, Pagination, Breadcrumbs, JsonLd } from '@/components/site/chrome';
import { buildCollectionSchema } from '@/engine/schema';
import { schemaContext } from '@/engine/generate';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ page?: string }> };

async function load(slug: string) {
  const [row] = await db.select().from(categories).where(eq(categories.slug, slug));
  return row ?? null;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ slug }, { page }] = await Promise.all([params, searchParams]);
  const cat = await load(slug);
  if (!cat) return { title: 'Not found', robots: { index: false } };
  const n = Math.max(1, Number(page) || 1);
  return {
    title: cat.metaTitle || (n > 1 ? `${cat.name} — page ${n}` : cat.name),
    description: cat.metaDescription || cat.description || `Articles about ${cat.name}.`,
    alternates: { canonical: n > 1 ? `/category/${cat.slug}?page=${n}` : `/category/${cat.slug}` },
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const [{ slug }, { page }] = await Promise.all([params, searchParams]);
  const cat = await load(slug);
  if (!cat) notFound();

  const data = await listPosts({ page: Number(page) || 1, categoryId: cat.id });
  const ctx = await schemaContext();

  return (
    <div className="mx-auto max-w-7xl px-[var(--gutter)] py-10">
      <JsonLd
        json={buildCollectionSchema(ctx, {
          url: `${ctx.siteUrl}/category/${cat.slug}`,
          name: cat.name,
          description: cat.description,
          items: data.posts.map((p) => ({ title: p.title, url: `${ctx.siteUrl}/blog/${p.slug}` })),
        })}
      />
      <Breadcrumbs trail={[{ name: 'Home', href: '/' }, { name: 'Blog', href: '/blog' }, { name: cat.name }]} />

      <header className="border-b pb-8" style={{ borderColor: 'var(--line)' }}>
        <p className="eyebrow">Topic</p>
        <h1 className="headline mt-3 text-[clamp(2rem,5vw,3.25rem)]">{cat.name}</h1>
        {cat.description && (
          <p className="mt-3 max-w-2xl text-lg leading-relaxed" style={{ color: 'var(--ink-2)' }}>
            {cat.description}
          </p>
        )}
        <p className="mt-3 text-sm" style={{ color: 'var(--ink-3)' }}>
          {data.total} article{data.total === 1 ? '' : 's'}
        </p>
      </header>

      {data.posts.length === 0 ? (
        <p className="py-20 text-center text-sm" style={{ color: 'var(--ink-3)' }}>
          No articles in this category yet.
        </p>
      ) : (
        <div className="mt-10 grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {data.posts.map((p, i) => (
            <PostCard key={p.id} post={p} priority={i < 3} />
          ))}
        </div>
      )}

      <Pagination page={data.page} totalPages={data.totalPages} basePath={`/category/${cat.slug}`} />
    </div>
  );
}
