import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db, users } from '@/db';
import { listPosts, PostCard, Pagination, Breadcrumbs, JsonLd } from '@/components/site/chrome';
import { schemaContext } from '@/engine/generate';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ page?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const [author] = await db.select().from(users).where(eq(users.slug, slug));
  if (!author) return { title: 'Not found', robots: { index: false } };
  return {
    title: `${author.name} — articles`,
    description: author.bio || `Articles written by ${author.name}.`,
    alternates: { canonical: `/author/${author.slug}` },
  };
}

export default async function AuthorPage({ params, searchParams }: Props) {
  const [{ slug }, { page }] = await Promise.all([params, searchParams]);
  const [author] = await db.select().from(users).where(eq(users.slug, slug));
  if (!author) notFound();

  const data = await listPosts({ page: Number(page) || 1, authorId: author.id });
  const ctx = await schemaContext();

  return (
    <div className="mx-auto max-w-7xl px-[var(--gutter)] py-10">
      <JsonLd
        json={JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'ProfilePage',
          mainEntity: {
            '@type': 'Person',
            name: author.name,
            description: author.bio || undefined,
            url: `${ctx.siteUrl}/author/${author.slug}`,
          },
        })}
      />
      <Breadcrumbs trail={[{ name: 'Home', href: '/' }, { name: author.name }]} />

      <header className="flex flex-wrap items-center gap-5 border-b pb-8" style={{ borderColor: 'var(--line)' }}>
        <div
          className="grid h-16 w-16 shrink-0 place-items-center text-2xl font-bold text-white"
          style={{ background: 'var(--brand)', fontFamily: 'var(--font-display)' }}
          aria-hidden
        >
          {author.name.slice(0, 1)}
        </div>
        <div>
          <p className="eyebrow">Author</p>
          <h1 className="headline mt-1.5 text-[clamp(1.75rem,4vw,2.5rem)]">{author.name}</h1>
          {author.bio && (
            <p className="mt-2 max-w-2xl leading-relaxed" style={{ color: 'var(--ink-2)' }}>
              {author.bio}
            </p>
          )}
          <p className="mt-2 text-sm" style={{ color: 'var(--ink-3)' }}>
            {data.total} article{data.total === 1 ? '' : 's'}
          </p>
        </div>
      </header>

      <div className="mt-10 grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
        {data.posts.map((p) => (
          <PostCard key={p.id} post={p} />
        ))}
      </div>

      <Pagination page={data.page} totalPages={data.totalPages} basePath={`/author/${author.slug}`} />
    </div>
  );
}
