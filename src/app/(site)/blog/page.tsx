import type { Metadata } from 'next';
import { getSettings } from '@/lib/settings';
import { listPosts, PostCard, Pagination, Breadcrumbs, JsonLd } from '@/components/site/chrome';
import { buildCollectionSchema } from '@/engine/schema';
import { schemaContext } from '@/engine/generate';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ page?: string }> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { page } = await searchParams;
  const n = Math.max(1, Number(page) || 1);
  const s = await getSettings();
  return {
    title: n > 1 ? `All articles — page ${n}` : 'All articles',
    description: `Every article published on ${s['site.name']}, newest first.`,
    alternates: { canonical: n > 1 ? `/blog?page=${n}` : '/blog' },
  };
}

export default async function BlogIndex({ searchParams }: Props) {
  const { page } = await searchParams;
  const s = await getSettings();
  const perPage = Number(s['site.postsPerPage']) || 12;
  const data = await listPosts({ page: Number(page) || 1, perPage });
  const ctx = await schemaContext();

  return (
    <div className="mx-auto max-w-7xl px-[var(--gutter)] py-10">
      <JsonLd
        json={buildCollectionSchema(ctx, {
          url: `${ctx.siteUrl}/blog`,
          name: 'All articles',
          description: `Every article published on ${ctx.siteName}.`,
          items: data.posts.map((p) => ({ title: p.title, url: `${ctx.siteUrl}/blog/${p.slug}` })),
        })}
      />
      <Breadcrumbs trail={[{ name: 'Home', href: '/' }, { name: 'Blog' }]} />

      <header className="border-b pb-8" style={{ borderColor: 'var(--line)' }}>
        <p className="eyebrow">Archive</p>
        <h1 className="headline mt-3 text-[clamp(2rem,5vw,3.25rem)]">All articles</h1>
        <p className="mt-3 text-base" style={{ color: 'var(--ink-2)' }}>
          {data.total} article{data.total === 1 ? '' : 's'}, newest first.
        </p>
      </header>

      {data.posts.length === 0 ? (
        <p className="py-20 text-center text-sm" style={{ color: 'var(--ink-3)' }}>
          Nothing published yet.
        </p>
      ) : (
        <div className="mt-10 grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {data.posts.map((p, i) => (
            <PostCard key={p.id} post={p} priority={i < 3} />
          ))}
        </div>
      )}

      <Pagination page={data.page} totalPages={data.totalPages} basePath="/blog" />
    </div>
  );
}
