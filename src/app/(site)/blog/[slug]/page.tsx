import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, desc, eq, sql, ne } from 'drizzle-orm';
import { db, posts, categories, users, tags, postTags } from '@/db';
import { getSettings, isOn } from '@/lib/settings';
import { formatDate, json } from '@/lib/util';
import { renderMarkdown, buildToc } from '@/lib/markdown';
import {
  PostCard, PostRow, AdSlot, JsonLd, Breadcrumbs, SectionHead, type CardPost,
} from '@/components/site/chrome';
import { ReadingProgress, ShareBar } from '@/components/site/reading-progress';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string }> };

async function loadPost(slug: string) {
  const [row] = await db
    .select({
      post: posts,
      categoryName: categories.name,
      categorySlug: categories.slug,
      authorName: users.name,
      authorSlug: users.slug,
      authorBio: users.bio,
      authorAvatar: users.avatarUrl,
    })
    .from(posts)
    .leftJoin(categories, eq(categories.id, posts.categoryId))
    .leftJoin(users, eq(users.id, posts.authorId))
    .where(eq(posts.slug, slug));
  return row ?? null;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const row = await loadPost(slug);
  if (!row || row.post.status !== 'published') return { title: 'Not found', robots: { index: false } };

  const p = row.post;
  const s = await getSettings();
  const base = (s['site.url'] || '').replace(/\/+$/, '');
  const url = `${base}/blog/${p.slug}`;
  const image = p.featuredImage
    ? p.featuredImage.startsWith('http')
      ? p.featuredImage
      : `${base}${p.featuredImage}`
    : undefined;

  return {
    title: p.metaTitle || p.title,
    description: p.metaDescription || p.excerpt,
    keywords: [p.focusKeyword, ...json<string[]>(p.secondaryKeywords, [])].filter(Boolean),
    alternates: { canonical: p.canonicalUrl || url },
    robots: p.noindex || isOn(s['seo.noindexSite']) ? { index: false, follow: true } : undefined,
    openGraph: {
      type: 'article',
      url,
      title: p.metaTitle || p.title,
      description: p.metaDescription || p.excerpt,
      publishedTime: p.publishedAt ? new Date(p.publishedAt).toISOString() : undefined,
      modifiedTime: new Date(p.updatedAt).toISOString(),
      authors: row.authorName ? [row.authorName] : undefined,
      section: row.categoryName || undefined,
      images: image ? [{ url: image, alt: p.featuredImageAlt || p.title }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: p.metaTitle || p.title,
      description: p.metaDescription || p.excerpt,
      images: image ? [image] : undefined,
    },
  };
}

export default async function PostPage({ params }: Params) {
  const { slug } = await params;
  const row = await loadPost(slug);
  if (!row || row.post.status !== 'published') notFound();

  const p = row.post;
  const s = await getSettings();
  const base = (s['site.url'] || '').replace(/\/+$/, '');

  // Rendered at request time so edits and auto-fixes appear immediately, and
  // so heading ids always match the table of contents.
  const { html, headings } = renderMarkdown(p.contentMd);
  const toc = buildToc(headings);

  const [postTagRows, related, more] = await Promise.all([
    db
      .select({ name: tags.name, slug: tags.slug })
      .from(postTags)
      .innerJoin(tags, eq(tags.id, postTags.tagId))
      .where(eq(postTags.postId, p.id)),
    db
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
          ne(posts.id, p.id),
          p.categoryId ? eq(posts.categoryId, p.categoryId) : sql`1=1`,
        ),
      )
      .orderBy(desc(posts.publishedAt))
      .limit(3),
    db
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
      .where(and(eq(posts.status, 'published'), ne(posts.id, p.id)))
      .orderBy(desc(posts.publishedAt))
      .limit(5),
  ]);

  const adsOn = isOn(s['adsense.enabled']) && !!s['adsense.client'];

  return (
    <>
      <JsonLd json={p.schemaJson} />
      <ReadingProgress />

      <article>
        {/* ============================================================ head */}
        <header className="border-b" style={{ borderColor: 'var(--line)' }}>
          <div className="mx-auto max-w-3xl px-[var(--gutter)] pb-10 pt-8">
            <Breadcrumbs
              trail={[
                { name: 'Home', href: '/' },
                { name: 'Blog', href: '/blog' },
                ...(row.categoryName && row.categorySlug
                  ? [{ name: row.categoryName, href: `/category/${row.categorySlug}` }]
                  : []),
                { name: p.title },
              ]}
            />

            {row.categoryName && row.categorySlug && (
              <Link href={`/category/${row.categorySlug}`} className="eyebrow hover:underline">
                {row.categoryName}
              </Link>
            )}

            <h1 className="headline mt-3 text-[clamp(2rem,4.6vw,3.25rem)]">{p.title}</h1>

            <p className="mt-5 text-xl leading-relaxed" style={{ color: 'var(--ink-2)' }}>
              {p.excerpt}
            </p>

            <div
              className="mt-7 flex flex-wrap items-center gap-x-3 gap-y-2 border-t pt-4 text-sm"
              style={{ borderColor: 'var(--line)', color: 'var(--ink-3)' }}
            >
              {row.authorName && (
                <span>
                  By{' '}
                  <Link
                    href={`/author/${row.authorSlug}`}
                    className="font-medium underline-offset-4 hover:underline"
                    style={{ color: 'var(--ink)' }}
                  >
                    {row.authorName}
                  </Link>
                </span>
              )}
              <span aria-hidden>·</span>
              <time dateTime={p.publishedAt ? new Date(p.publishedAt).toISOString() : undefined}>
                {formatDate(p.publishedAt)}
              </time>
              {p.readingTime > 0 && (
                <>
                  <span aria-hidden>·</span>
                  <span>{p.readingTime} min read</span>
                </>
              )}
            </div>
          </div>
        </header>

        {/* ========================================================== image */}
        {p.featuredImage && (
          <figure className="mx-auto max-w-5xl px-[var(--gutter)] pt-10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={p.featuredImage}
              alt={p.featuredImageAlt || p.title}
              className="w-full"
              fetchPriority="high"
              decoding="async"
            />
            {p.featuredImageAlt && (
              <figcaption
                className="mt-3 border-l-2 pl-3 text-[0.8125rem]"
                style={{ borderColor: 'var(--line)', color: 'var(--ink-3)' }}
              >
                {p.featuredImageAlt}
              </figcaption>
            )}
          </figure>
        )}

        {/* =========================================================== body */}
        <div className="mx-auto max-w-6xl px-[var(--gutter)] py-12">
          <div className="grid gap-x-14 gap-y-12 lg:grid-cols-12">
            <div className="min-w-0 lg:col-span-8">
              {toc && <div dangerouslySetInnerHTML={{ __html: toc }} />}
              <div className="prose-article" dangerouslySetInnerHTML={{ __html: html }} />

              {adsOn && <AdSlot client={s['adsense.client']} slot={s['adsense.slotInArticle']} />}

              <div
                className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t pt-6"
                style={{ borderColor: 'var(--line)' }}
              >
                <ShareBar title={p.title} url={`${base}/blog/${p.slug}`} />
                {postTagRows.length > 0 && (
                  <ul className="flex flex-wrap gap-2">
                    {postTagRows.map((t) => (
                      <li key={t.slug}>
                        <Link
                          href={`/tag/${t.slug}`}
                          className="inline-block border px-2.5 py-1 text-xs font-medium transition-colors hover:border-[var(--accent)]"
                          style={{ borderColor: 'var(--line)', color: 'var(--ink-2)' }}
                        >
                          {t.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {row.authorName && (
                <aside
                  className="mt-10 flex gap-5 border-t pt-8"
                  style={{ borderColor: 'var(--line)' }}
                >
                  <div
                    className="grid h-14 w-14 shrink-0 place-items-center text-xl font-bold text-white"
                    style={{ background: 'var(--brand)', fontFamily: 'var(--font-display)' }}
                    aria-hidden
                  >
                    {row.authorName.slice(0, 1)}
                  </div>
                  <div>
                    <p className="eyebrow" style={{ color: 'var(--ink-3)' }}>
                      Written by
                    </p>
                    <p className="mt-1 text-lg font-semibold" style={{ color: 'var(--ink)' }}>
                      {row.authorName}
                    </p>
                    {row.authorBio && (
                      <p className="mt-1.5 max-w-xl text-sm leading-relaxed" style={{ color: 'var(--ink-2)' }}>
                        {row.authorBio}
                      </p>
                    )}
                    <Link
                      href={`/author/${row.authorSlug}`}
                      className="mt-2.5 inline-block text-sm font-medium underline-offset-4 hover:underline"
                      style={{ color: 'var(--accent-text)' }}
                    >
                      More from this author →
                    </Link>
                  </div>
                </aside>
              )}

              {isOn(s['gen.disclosure']) && (
                <p
                  className="mt-8 border-l-2 py-1 pl-4 text-xs leading-relaxed"
                  style={{ borderColor: 'var(--accent)', color: 'var(--ink-3)' }}
                >
                  {s['gen.disclosureText']}
                </p>
              )}
            </div>

            {/* ====================================================== rail */}
            <aside className="lg:col-span-4">
              <div className="space-y-10 lg:sticky lg:top-28">
                {more.length > 0 && (
                  <section>
                    <SectionHead title="Recent" />
                    <div className="space-y-4">
                      {(more as CardPost[]).map((r, i) => (
                        <PostRow key={r.id} post={r} index={i} />
                      ))}
                    </div>
                  </section>
                )}

                {adsOn && s['adsense.slotSidebar'] && (
                  <AdSlot client={s['adsense.client']} slot={s['adsense.slotSidebar']} format="vertical" />
                )}
              </div>
            </aside>
          </div>
        </div>

        {/* ======================================================== related */}
        {related.length > 0 && (
          <section
            aria-labelledby="keep-reading"
            className="border-t py-14"
            style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}
          >
            <div className="mx-auto max-w-7xl px-[var(--gutter)]">
              <SectionHead title="Keep reading" href="/blog" />
              <div className="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
                {(related as CardPost[]).map((r) => (
                  <PostCard key={r.id} post={r} />
                ))}
              </div>
            </div>
          </section>
        )}
      </article>
    </>
  );
}
