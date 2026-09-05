import Link from 'next/link';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db, posts, categories } from '@/db';
import { getSettings, isOn } from '@/lib/settings';
import { formatDate } from '@/lib/util';
import {
  PostCard, PostRow, Meta, AdSlot, JsonLd, SectionHead, type CardPost,
} from '@/components/site/chrome';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const s = await getSettings();
  const base = (s['site.url'] || '').replace(/\/+$/, '');
  const perPage = Number(s['site.postsPerPage']) || 12;

  const recent = (await db
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
    .where(eq(posts.status, 'published'))
    .orderBy(desc(posts.publishedAt), desc(posts.id))
    .limit(perPage + 4)) as CardPost[];

  const cats = await db
    .select({
      id: categories.id,
      name: categories.name,
      slug: categories.slug,
      description: categories.description,
      count: sql<number>`COUNT(${posts.id})::int`,
    })
    .from(categories)
    .leftJoin(posts, and(eq(posts.categoryId, categories.id), eq(posts.status, 'published')))
    .groupBy(categories.id, categories.name, categories.slug, categories.description)
    .orderBy(categories.name);

  const [lead, ...rest] = recent;
  const secondary = rest.slice(0, 2);
  const grid = rest.slice(2, 8);
  const rail = rest.slice(0, 5);
  const activeCats = cats.filter((c) => Number(c.count) > 0);

  const websiteSchema = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: s['site.name'],
    url: base || undefined,
    description: s['site.description'],
    potentialAction: base
      ? {
          '@type': 'SearchAction',
          target: { '@type': 'EntryPoint', urlTemplate: `${base}/search?q={search_term_string}` },
          'query-input': 'required name=search_term_string',
        }
      : undefined,
  });

  if (recent.length === 0) return <EmptyHome tagline={s['site.tagline']} description={s['site.description']} />;

  return (
    <>
      <JsonLd json={websiteSchema} />

      <div className="mx-auto max-w-7xl px-[var(--gutter)]">
        {/* ============================================ lead + secondary === */}
        <section aria-label="Top stories" className="grid gap-x-10 gap-y-10 border-b py-10 lg:grid-cols-12 lg:py-14" style={{ borderColor: 'var(--line)' }}>
          {lead && (
            <article className="group lg:col-span-8">
              <Link href={`/blog/${lead.slug}`} className="media-frame block aspect-[16/9]" tabIndex={-1} aria-hidden>
                {lead.featuredImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={lead.featuredImage}
                    alt=""
                    className="h-full w-full object-cover"
                    fetchPriority="high"
                    decoding="async"
                  />
                ) : (
                  <div className="h-full w-full" style={{ background: 'var(--surface-2)' }} />
                )}
              </Link>

              <div className="pt-5">
                <Meta post={lead} />
                <h1 className="headline mt-2.5 text-[clamp(1.9rem,4.2vw,3rem)]">
                  <Link href={`/blog/${lead.slug}`} className="card-link">
                    {lead.title}
                  </Link>
                </h1>
                <p className="mt-4 max-w-2xl text-lg leading-relaxed" style={{ color: 'var(--ink-2)' }}>
                  {lead.excerpt}
                </p>
                <p className="mt-4 text-xs" style={{ color: 'var(--ink-3)' }}>
                  {lead.readingTime} min read
                </p>
              </div>
            </article>
          )}

          <div className="lg:col-span-4">
            <p className="eyebrow mb-4">Also this week</p>
            <div className="space-y-7">
              {secondary.map((p) => (
                <article key={p.id} className="group">
                  <Meta post={p} />
                  <h2
                    className="mt-2 text-[1.35rem] font-bold leading-[1.2] tracking-[-0.015em]"
                    style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)' }}
                  >
                    <Link href={`/blog/${p.slug}`} className="card-link">
                      {p.title}
                    </Link>
                  </h2>
                  <p className="mt-2 line-clamp-3 text-[0.9375rem] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
                    {p.excerpt}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {isOn(s['adsense.enabled']) && <AdSlot client={s['adsense.client']} slot={s['adsense.slotInArticle']} />}

        {/* ================================================ grid + rail === */}
        <div className="grid gap-x-12 gap-y-14 py-12 lg:grid-cols-12">
          <section aria-labelledby="latest" className="lg:col-span-8">
            <SectionHead title="Latest" href="/blog" />
            <div className="grid gap-x-8 gap-y-10 sm:grid-cols-2">
              {grid.map((p) => (
                <PostCard key={p.id} post={p} />
              ))}
            </div>
          </section>

          <aside className="lg:col-span-4">
            <div className="lg:sticky lg:top-28">
              <SectionHead title="Most read" />
              <div className="space-y-4">
                {rail.map((p, i) => (
                  <PostRow key={p.id} post={p} index={i} />
                ))}
              </div>

              {isOn(s['adsense.enabled']) && s['adsense.slotSidebar'] && (
                <AdSlot client={s['adsense.client']} slot={s['adsense.slotSidebar']} format="vertical" />
              )}
            </div>
          </aside>
        </div>

        {/* ==================================================== topics === */}
        {activeCats.length > 0 && (
          <section aria-labelledby="topics" className="border-t py-14" style={{ borderColor: 'var(--line)' }}>
            <SectionHead title="Browse by topic" />
            <div className="grid gap-px overflow-hidden sm:grid-cols-2 lg:grid-cols-3" style={{ background: 'var(--line)' }}>
              {activeCats.map((c) => (
                <Link
                  key={c.slug}
                  href={`/category/${c.slug}`}
                  className="group p-6 transition-colors"
                  style={{ background: 'var(--surface)' }}
                >
                  <p className="text-xs font-bold uppercase tracking-[0.14em] tabular-nums" style={{ color: 'var(--accent-text)' }}>
                    {String(Number(c.count)).padStart(2, '0')}
                  </p>
                  <p
                    className="mt-2 text-xl font-bold tracking-[-0.015em] transition-colors group-hover:text-[var(--accent-text)]"
                    style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)' }}
                  >
                    {c.name}
                  </p>
                  {c.description && (
                    <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed" style={{ color: 'var(--ink-2)' }}>
                      {c.description}
                    </p>
                  )}
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}

function EmptyHome({ tagline, description }: { tagline: string; description: string }) {
  return (
    <div className="mx-auto max-w-3xl px-[var(--gutter)] py-24 text-center">
      <p className="eyebrow">Nothing published yet</p>
      <h1 className="headline mt-4 text-[clamp(2rem,5vw,3.25rem)]">{tagline}</h1>
      <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed" style={{ color: 'var(--ink-2)' }}>
        {description}
      </p>
      <p className="mx-auto mt-8 max-w-md text-sm leading-relaxed" style={{ color: 'var(--ink-3)' }}>
        Open the dashboard to load the sample articles, add a free AI provider key, and start a publishing
        campaign.
      </p>
      <Link
        href="/admin"
        className="mt-8 inline-flex items-center px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        style={{ background: 'var(--brand)' }}
      >
        Open the dashboard
      </Link>
    </div>
  );
}
