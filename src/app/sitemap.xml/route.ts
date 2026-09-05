import { and, desc, eq, sql } from 'drizzle-orm';
import { db, posts, categories, tags, postTags, pages, users } from '@/db';
import { getSettings, isOn } from '@/lib/settings';
import { escapeHtml } from '@/lib/util';

export const dynamic = 'force-dynamic';

type Entry = { loc: string; lastmod?: Date | null; changefreq?: string; priority?: string; image?: { url: string; alt: string } | null };

/**
 * Hand-rolled rather than Next's sitemap helper so we can emit image entries
 * and keep every URL in one file that Search Console can be pointed at.
 */
export async function GET() {
  const s = await getSettings();
  const base = (s['site.url'] || 'http://localhost:3000').replace(/\/+$/, '');

  if (isOn(s['seo.noindexSite'])) {
    return new Response(xml([]), { headers: headers() });
  }

  const [postRows, catRows, tagRows, pageRows, authorRows, [{ newest }]] = await Promise.all([
    db
      .select({
        slug: posts.slug,
        updatedAt: posts.updatedAt,
        publishedAt: posts.publishedAt,
        image: posts.featuredImage,
        alt: posts.featuredImageAlt,
      })
      .from(posts)
      .where(and(eq(posts.status, 'published'), eq(posts.noindex, false)))
      .orderBy(desc(posts.publishedAt))
      .limit(45_000),
    db
      .select({ slug: categories.slug, count: sql<number>`COUNT(${posts.id})::int` })
      .from(categories)
      .leftJoin(posts, and(eq(posts.categoryId, categories.id), eq(posts.status, 'published')))
      .groupBy(categories.id, categories.slug),
    db
      .select({ slug: tags.slug, count: sql<number>`COUNT(${posts.id})::int` })
      .from(tags)
      .leftJoin(postTags, eq(postTags.tagId, tags.id))
      .leftJoin(posts, and(eq(posts.id, postTags.postId), eq(posts.status, 'published')))
      .groupBy(tags.id, tags.slug),
    db.select({ slug: pages.slug, updatedAt: pages.updatedAt }).from(pages).where(eq(pages.status, 'published')),
    db
      .select({ slug: users.slug, count: sql<number>`COUNT(${posts.id})::int` })
      .from(users)
      .leftJoin(posts, and(eq(posts.authorId, users.id), eq(posts.status, 'published')))
      .groupBy(users.id, users.slug),
    db
      .select({ newest: sql<Date | null>`MAX(${posts.publishedAt})` })
      .from(posts)
      .where(eq(posts.status, 'published')),
  ]);

  const homeLastmod = newest ? new Date(newest) : new Date();

  const entries: Entry[] = [
    { loc: `${base}/`, lastmod: homeLastmod, changefreq: 'daily', priority: '1.0' },
    { loc: `${base}/blog`, lastmod: homeLastmod, changefreq: 'daily', priority: '0.9' },
    ...postRows.map((p) => ({
      loc: `${base}/blog/${p.slug}`,
      lastmod: p.updatedAt || p.publishedAt,
      changefreq: 'weekly',
      priority: '0.8',
      image: p.image ? { url: p.image.startsWith('http') ? p.image : `${base}${p.image}`, alt: p.alt || '' } : null,
    })),
    ...catRows
      .filter((c) => Number(c.count) > 0)
      .map((c) => ({ loc: `${base}/category/${c.slug}`, changefreq: 'weekly', priority: '0.7' })),
    ...tagRows
      .filter((t) => Number(t.count) > 0)
      .map((t) => ({ loc: `${base}/tag/${t.slug}`, changefreq: 'monthly', priority: '0.4' })),
    ...authorRows
      .filter((a) => Number(a.count) > 0)
      .map((a) => ({ loc: `${base}/author/${a.slug}`, changefreq: 'monthly', priority: '0.4' })),
    ...pageRows.map((p) => ({
      loc: `${base}/${p.slug}`,
      lastmod: p.updatedAt,
      changefreq: 'yearly',
      priority: '0.5',
    })),
  ];

  return new Response(xml(entries), { headers: headers() });
}

function xml(entries: Entry[]): string {
  const body = entries
    .map((e) => {
      const parts = [`    <loc>${escapeHtml(e.loc)}</loc>`];
      if (e.lastmod) parts.push(`    <lastmod>${new Date(e.lastmod).toISOString()}</lastmod>`);
      if (e.changefreq) parts.push(`    <changefreq>${e.changefreq}</changefreq>`);
      if (e.priority) parts.push(`    <priority>${e.priority}</priority>`);
      if (e.image) {
        parts.push(
          '    <image:image>',
          `      <image:loc>${escapeHtml(e.image.url)}</image:loc>`,
          ...(e.image.alt ? [`      <image:title>${escapeHtml(e.image.alt)}</image:title>`] : []),
          '    </image:image>',
        );
      }
      return `  <url>\n${parts.join('\n')}\n  </url>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${body}
</urlset>`;
}

const headers = () => ({
  'content-type': 'application/xml; charset=utf-8',
  'cache-control': 'public, max-age=0, s-maxage=3600',
});
