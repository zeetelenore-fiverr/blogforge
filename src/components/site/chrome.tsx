import Link from 'next/link';
import { desc, eq, and, sql } from 'drizzle-orm';
import { db, categories, pages, posts } from '@/db';
import { getSettings, isOn } from '@/lib/settings';
import { formatDate } from '@/lib/util';

/* ------------------------------------------------------------- header */

export async function SiteHeader() {
  const s = await getSettings();
  const [cats, headerPages] = await Promise.all([
    db
      .select({
        name: categories.name,
        slug: categories.slug,
        count: sql<number>`COUNT(${posts.id})::int`,
      })
      .from(categories)
      .leftJoin(posts, and(eq(posts.categoryId, categories.id), eq(posts.status, 'published')))
      .groupBy(categories.id, categories.name, categories.slug)
      .orderBy(categories.name),
    db
      .select({ title: pages.title, slug: pages.slug })
      .from(pages)
      .where(and(eq(pages.status, 'published'), eq(pages.showInHeader, true)))
      .orderBy(pages.sortOrder),
  ]);

  const visibleCats = cats.filter((c) => Number(c.count) > 0).slice(0, 6);
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <header
      className="sticky top-0 z-40 border-b"
      style={{ borderColor: 'var(--line)', background: 'color-mix(in srgb, var(--surface) 92%, transparent)', backdropFilter: 'blur(8px)' }}
    >
      {/* dateline strip — the small editorial signal that this is a publication */}
      <div className="hidden border-b lg:block" style={{ borderColor: 'var(--line-soft)' }}>
        <div className="mx-auto flex max-w-7xl items-center justify-between px-[var(--gutter)] py-1.5 text-[11px] tracking-wide" style={{ color: 'var(--ink-3)' }}>
          <span>{today}</span>
          <span className="flex items-center gap-4">
            {isOn(s['seo.rssEnabled']) && (
              <a href="/feed.xml" className="hover:underline" style={{ textUnderlineOffset: '3px' }}>
                RSS
              </a>
            )}
            <span className="eyebrow" style={{ color: 'var(--ink-3)' }}>
              Independent publishing
            </span>
          </span>
        </div>
      </div>

      <div className="mx-auto flex max-w-7xl items-center gap-5 px-[var(--gutter)] py-3.5">
        <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label={`${s['site.name']} home`}>
          {s['site.logoUrl'] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={s['site.logoUrl']} alt={s['site.name']} className="h-9 w-auto" />
          ) : (
            <span
              className="grid h-9 w-9 place-items-center text-sm font-black text-white"
              style={{ background: 'var(--brand)' }}
              aria-hidden
            >
              {s['site.name'].slice(0, 1).toUpperCase()}
            </span>
          )}
          <span
            className="text-[1.35rem] font-bold leading-none tracking-[-0.02em]"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)' }}
          >
            {s['site.name']}
          </span>
        </Link>

        <nav aria-label="Primary" className="ml-3 hidden flex-1 items-center gap-0.5 md:flex">
          <NavLink href="/blog">All articles</NavLink>
          {visibleCats.map((c) => (
            <NavLink key={c.slug} href={`/category/${c.slug}`}>
              {c.name}
            </NavLink>
          ))}
          {headerPages.map((p) => (
            <NavLink key={p.slug} href={`/${p.slug}`}>
              {p.title}
            </NavLink>
          ))}
        </nav>

        <form action="/search" role="search" className="ml-auto flex items-center">
          <label htmlFor="site-search" className="sr-only">
            Search articles
          </label>
          <input
            id="site-search"
            type="search"
            name="q"
            placeholder="Search"
            className="w-28 border-b bg-transparent px-1 py-1.5 text-sm outline-none transition-[width] focus:w-48 sm:w-36"
            style={{ borderColor: 'var(--line)', color: 'var(--ink)' }}
          />
          <button type="submit" className="sr-only">
            Search
          </button>
        </form>
      </div>

      {visibleCats.length > 0 && (
        <div className="border-t md:hidden" style={{ borderColor: 'var(--line-soft)' }}>
          <nav aria-label="Categories" className="flex gap-4 overflow-x-auto px-[var(--gutter)] py-2 text-xs font-semibold uppercase tracking-wider">
            <Link href="/blog" className="whitespace-nowrap py-1" style={{ color: 'var(--ink-2)' }}>
              All
            </Link>
            {visibleCats.map((c) => (
              <Link key={c.slug} href={`/category/${c.slug}`} className="whitespace-nowrap py-1" style={{ color: 'var(--ink-2)' }}>
                {c.name}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="relative px-3 py-2 text-sm font-medium transition-colors hover:text-[var(--accent-text)]"
      style={{ color: 'var(--ink-2)' }}
    >
      {children}
    </Link>
  );
}

/* ------------------------------------------------------------- footer */

export async function SiteFooter() {
  const s = await getSettings();
  const [cats, footerPages] = await Promise.all([
    db.select({ name: categories.name, slug: categories.slug }).from(categories).orderBy(categories.name).limit(8),
    db
      .select({ title: pages.title, slug: pages.slug })
      .from(pages)
      .where(and(eq(pages.status, 'published'), eq(pages.showInFooter, true)))
      .orderBy(pages.sortOrder),
  ]);

  const socials = (
    [
      ['X / Twitter', s['social.twitter']],
      ['Facebook', s['social.facebook']],
      ['LinkedIn', s['social.linkedin']],
      ['YouTube', s['social.youtube']],
      ['Instagram', s['social.instagram']],
    ] as const
  ).filter(([, url]) => !!url);

  return (
    <footer className="mt-20 border-t" style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}>
      <div className="mx-auto max-w-7xl px-[var(--gutter)] py-14">
        <div className="grid gap-10 md:grid-cols-12">
          <div className="md:col-span-5">
            <p
              className="text-2xl font-bold tracking-[-0.02em]"
              style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)' }}
            >
              {s['site.name']}
            </p>
            <p className="mt-3 max-w-sm text-sm leading-relaxed" style={{ color: 'var(--ink-2)' }}>
              {s['site.description']}
            </p>
            {socials.length > 0 && (
              <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2">
                {socials.map(([label, url]) => (
                  <li key={label}>
                    <a
                      href={url}
                      rel="noopener me"
                      target="_blank"
                      className="text-sm underline-offset-4 hover:underline"
                      style={{ color: 'var(--ink-2)' }}
                    >
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <nav aria-label="Topics" className="md:col-span-3 md:col-start-7">
            <p className="eyebrow" style={{ color: 'var(--ink-3)' }}>
              Topics
            </p>
            <ul className="mt-4 space-y-2.5">
              {cats.map((c) => (
                <li key={c.slug}>
                  <Link href={`/category/${c.slug}`} className="text-sm hover:text-[var(--accent-text)]" style={{ color: 'var(--ink-2)' }}>
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Site" className="md:col-span-3">
            <p className="eyebrow" style={{ color: 'var(--ink-3)' }}>
              Site
            </p>
            <ul className="mt-4 space-y-2.5">
              <li>
                <Link href="/blog" className="text-sm hover:text-[var(--accent-text)]" style={{ color: 'var(--ink-2)' }}>
                  All articles
                </Link>
              </li>
              {footerPages.map((p) => (
                <li key={p.slug}>
                  <Link href={`/${p.slug}`} className="text-sm hover:text-[var(--accent-text)]" style={{ color: 'var(--ink-2)' }}>
                    {p.title}
                  </Link>
                </li>
              ))}
              {isOn(s['seo.rssEnabled']) && (
                <li>
                  <a href="/feed.xml" className="text-sm hover:text-[var(--accent-text)]" style={{ color: 'var(--ink-2)' }}>
                    RSS feed
                  </a>
                </li>
              )}
            </ul>
          </nav>
        </div>
      </div>

      <div className="border-t px-[var(--gutter)] py-6" style={{ borderColor: 'var(--line-soft)' }}>
        <p className="mx-auto max-w-7xl text-xs leading-relaxed" style={{ color: 'var(--ink-3)' }}>
          {s['site.copyright'] ||
            `© ${new Date().getFullYear()} ${s['org.name'] || s['site.name']}. All rights reserved.`}
          {isOn(s['gen.disclosure']) && <> · {s['gen.disclosureText']}</>}
        </p>
      </div>
    </footer>
  );
}

/* -------------------------------------------------------------- pieces */

export function AdSlot({
  client,
  slot,
  format = 'auto',
  label = true,
  className = '',
}: {
  client: string;
  slot: string;
  format?: string;
  label?: boolean;
  className?: string;
}) {
  if (!client || !slot) return null;
  return (
    <aside className={`my-10 ${className}`} aria-label="Advertisement">
      {label && (
        <p className="mb-1.5 text-center text-[10px] uppercase tracking-[0.2em]" style={{ color: 'var(--ink-3)' }}>
          Advertisement
        </p>
      )}
      <ins
        className="adsbygoogle block"
        style={{ display: 'block' }}
        data-ad-client={client}
        data-ad-slot={slot}
        data-ad-format={format}
        data-full-width-responsive="true"
      />
      <script dangerouslySetInnerHTML={{ __html: '(adsbygoogle = window.adsbygoogle || []).push({});' }} />
    </aside>
  );
}

export type CardPost = {
  id: number;
  title: string;
  slug: string;
  excerpt: string;
  featuredImage: string | null;
  featuredImageAlt: string | null;
  publishedAt: Date | null;
  readingTime: number;
  categoryName?: string | null;
  categorySlug?: string | null;
};

/** Standard grid card. */
export function PostCard({ post, priority = false }: { post: CardPost; priority?: boolean }) {
  return (
    <article className="group flex flex-col">
      <Link href={`/blog/${post.slug}`} className="media-frame block aspect-[16/10]" tabIndex={-1} aria-hidden>
        {post.featuredImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.featuredImage}
            alt=""
            loading={priority ? 'eager' : 'lazy'}
            decoding="async"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="h-full w-full" style={{ background: 'var(--surface-2)' }} />
        )}
      </Link>

      <div className="flex flex-1 flex-col pt-4">
        <Meta post={post} />
        <h3
          className="mt-2 text-[1.2rem] font-bold leading-[1.25] tracking-[-0.015em]"
          style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)' }}
        >
          <Link href={`/blog/${post.slug}`} className="card-link">
            {post.title}
          </Link>
        </h3>
        <p className="mt-2 line-clamp-3 flex-1 text-[0.9375rem] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
          {post.excerpt}
        </p>
      </div>
    </article>
  );
}

/** Compact row used in rails and "most read" lists. */
export function PostRow({ post, index }: { post: CardPost; index?: number }) {
  return (
    <article className="group flex gap-4 border-t pt-4" style={{ borderColor: 'var(--line)' }}>
      {typeof index === 'number' && (
        <span
          className="shrink-0 text-2xl font-bold leading-none tabular-nums"
          style={{ fontFamily: 'var(--font-display)', color: 'var(--accent)' }}
          aria-hidden
        >
          {String(index + 1).padStart(2, '0')}
        </span>
      )}
      <div className="min-w-0">
        <h3 className="text-[1.0625rem] font-semibold leading-snug" style={{ color: 'var(--ink)' }}>
          <Link href={`/blog/${post.slug}`} className="card-link">
            {post.title}
          </Link>
        </h3>
        <p className="mt-1.5 text-xs" style={{ color: 'var(--ink-3)' }}>
          {post.categoryName && <>{post.categoryName} · </>}
          {post.readingTime} min read
        </p>
      </div>
    </article>
  );
}

export function Meta({ post }: { post: CardPost }) {
  return (
    <p className="flex flex-wrap items-center gap-x-2 text-[11px] font-semibold uppercase tracking-[0.12em]">
      {post.categoryName && post.categorySlug && (
        <Link href={`/category/${post.categorySlug}`} className="hover:underline" style={{ color: 'var(--accent-text)' }}>
          {post.categoryName}
        </Link>
      )}
      {post.categoryName && <span style={{ color: 'var(--line)' }}>/</span>}
      <time
        dateTime={post.publishedAt ? new Date(post.publishedAt).toISOString() : undefined}
        style={{ color: 'var(--ink-3)' }}
        className="font-medium tracking-normal normal-case"
      >
        {formatDate(post.publishedAt)}
      </time>
    </p>
  );
}

export function Pagination({ page, totalPages, basePath }: { page: number; totalPages: number; basePath: string }) {
  if (totalPages <= 1) return null;
  const href = (n: number) => (n === 1 ? basePath : `${basePath}${basePath.includes('?') ? '&' : '?'}page=${n}`);
  const nums = pageWindow(page, totalPages);

  return (
    <nav aria-label="Pagination" className="mt-14 flex items-center justify-center gap-1.5 border-t pt-8" style={{ borderColor: 'var(--line)' }}>
      {page > 1 && (
        <Link href={href(page - 1)} rel="prev" className="px-3 py-2 text-sm font-medium hover:text-[var(--accent-text)]" style={{ color: 'var(--ink-2)' }}>
          ← Previous
        </Link>
      )}
      {nums.map((n, i) =>
        n === '…' ? (
          <span key={`gap-${i}`} className="px-1.5 text-sm" style={{ color: 'var(--ink-3)' }}>
            …
          </span>
        ) : (
          <Link
            key={n}
            href={href(n as number)}
            aria-current={n === page ? 'page' : undefined}
            className="grid h-9 min-w-9 place-items-center px-2 text-sm font-medium tabular-nums transition-colors"
            style={
              n === page
                ? { background: 'var(--ink)', color: 'var(--surface)' }
                : { color: 'var(--ink-2)' }
            }
          >
            {n}
          </Link>
        ),
      )}
      {page < totalPages && (
        <Link href={href(page + 1)} rel="next" className="px-3 py-2 text-sm font-medium hover:text-[var(--accent-text)]" style={{ color: 'var(--ink-2)' }}>
          Next →
        </Link>
      )}
    </nav>
  );
}

function pageWindow(page: number, total: number): (number | '…')[] {
  const out: (number | '…')[] = [];
  for (let n = 1; n <= total; n++) {
    if (n === 1 || n === total || Math.abs(n - page) <= 1) out.push(n);
    else if (out[out.length - 1] !== '…') out.push('…');
  }
  return out;
}

export function Breadcrumbs({ trail }: { trail: { name: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-6">
      <ol className="flex flex-wrap items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.1em]">
        {trail.map((item, i) => (
          <li key={`${item.name}-${i}`} className="flex items-center gap-1.5">
            {item.href ? (
              <Link href={item.href} className="hover:text-[var(--accent-text)]" style={{ color: 'var(--ink-3)' }}>
                {item.name}
              </Link>
            ) : (
              <span className="max-w-[22ch] truncate normal-case tracking-normal" style={{ color: 'var(--ink-2)' }}>
                {item.name}
              </span>
            )}
            {i < trail.length - 1 && (
              <span aria-hidden style={{ color: 'var(--line)' }}>
                /
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function JsonLd({ json }: { json: string }) {
  if (!json) return null;
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}

export function SectionHead({ title, href, linkLabel = 'View all' }: { title: string; href?: string; linkLabel?: string }) {
  return (
    <div className="section-head">
      <h2 style={{ color: 'var(--ink)' }}>{title}</h2>
      {href && (
        <Link href={href} className="shrink-0 text-sm font-medium hover:underline" style={{ color: 'var(--accent-text)' }}>
          {linkLabel} →
        </Link>
      )}
    </div>
  );
}

/** Published posts with their category, for listings. */
export async function listPosts(opts: {
  page?: number;
  perPage?: number;
  categoryId?: number;
  authorId?: number;
  excludeId?: number;
}) {
  const perPage = opts.perPage ?? 12;
  const page = Math.max(1, opts.page ?? 1);

  const where = [eq(posts.status, 'published')];
  if (opts.categoryId) where.push(eq(posts.categoryId, opts.categoryId));
  if (opts.authorId) where.push(eq(posts.authorId, opts.authorId));
  if (opts.excludeId) where.push(sql`${posts.id} <> ${opts.excludeId}`);

  const [rows, [{ total }]] = await Promise.all([
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
      .where(and(...where))
      .orderBy(desc(posts.publishedAt), desc(posts.id))
      .limit(perPage)
      .offset((page - 1) * perPage),
    db.select({ total: sql<number>`COUNT(*)::int` }).from(posts).where(and(...where)),
  ]);

  return {
    posts: rows as CardPost[],
    total: Number(total),
    totalPages: Math.max(1, Math.ceil(Number(total) / perPage)),
    page,
  };
}
