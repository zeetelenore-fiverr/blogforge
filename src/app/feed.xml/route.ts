import { and, desc, eq } from 'drizzle-orm';
import { db, posts, categories, users } from '@/db';
import { getSettings, isOn } from '@/lib/settings';
import { escapeHtml } from '@/lib/util';

export const dynamic = 'force-dynamic';

export async function GET() {
  const s = await getSettings();
  const base = (s['site.url'] || 'http://localhost:3000').replace(/\/+$/, '');

  if (!isOn(s['seo.rssEnabled'])) return new Response('Not found', { status: 404 });

  const rows = await db
    .select({
      title: posts.title,
      slug: posts.slug,
      excerpt: posts.excerpt,
      contentHtml: posts.contentHtml,
      publishedAt: posts.publishedAt,
      image: posts.featuredImage,
      categoryName: categories.name,
      authorName: users.name,
    })
    .from(posts)
    .leftJoin(categories, eq(categories.id, posts.categoryId))
    .leftJoin(users, eq(users.id, posts.authorId))
    .where(and(eq(posts.status, 'published'), eq(posts.noindex, false)))
    .orderBy(desc(posts.publishedAt))
    .limit(30);

  const items = rows
    .map((p) => {
      const url = `${base}/blog/${p.slug}`;
      const img = p.image ? (p.image.startsWith('http') ? p.image : `${base}${p.image}`) : '';
      return `    <item>
      <title>${escapeHtml(p.title)}</title>
      <link>${escapeHtml(url)}</link>
      <guid isPermaLink="true">${escapeHtml(url)}</guid>
      <pubDate>${new Date(p.publishedAt || Date.now()).toUTCString()}</pubDate>
      <description>${escapeHtml(p.excerpt)}</description>
      ${p.categoryName ? `<category>${escapeHtml(p.categoryName)}</category>` : ''}
      ${p.authorName ? `<dc:creator><![CDATA[${p.authorName}]]></dc:creator>` : ''}
      ${img ? `<enclosure url="${escapeHtml(img)}" type="image/jpeg" />` : ''}
      <content:encoded><![CDATA[${p.contentHtml.replace(/\]\]>/g, ']]&gt;')}]]></content:encoded>
    </item>`;
    })
    .join('\n');

  const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeHtml(s['site.name'])}</title>
    <link>${escapeHtml(base)}</link>
    <description>${escapeHtml(s['site.description'] || s['site.tagline'])}</description>
    <language>${escapeHtml(s['site.language'] || 'en')}</language>
    <lastBuildDate>${new Date(rows[0]?.publishedAt || Date.now()).toUTCString()}</lastBuildDate>
    <atom:link href="${escapeHtml(base)}/feed.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>`;

  return new Response(feed, {
    headers: { 'content-type': 'application/rss+xml; charset=utf-8', 'cache-control': 'public, max-age=0, s-maxage=3600' },
  });
}
