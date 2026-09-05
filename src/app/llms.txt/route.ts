import { and, desc, eq, sql } from 'drizzle-orm';
import { db, posts, categories, pages } from '@/db';
import { getSettings, isOn } from '@/lib/settings';

export const dynamic = 'force-dynamic';

/**
 * /llms.txt — the emerging convention for telling language models what a site
 * contains and which URLs are worth reading, in Markdown.
 */
export async function GET() {
  const s = await getSettings();
  const base = (s['site.url'] || 'http://localhost:3000').replace(/\/+$/, '');

  if (!isOn(s['llms.enabled'])) {
    return new Response('Not found', { status: 404 });
  }

  const [catRows, pageRows] = await Promise.all([
    db
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
      .orderBy(categories.name),
    db
      .select({ title: pages.title, slug: pages.slug, description: pages.metaDescription })
      .from(pages)
      .where(eq(pages.status, 'published'))
      .orderBy(pages.sortOrder),
  ]);

  const lines: string[] = [
    `# ${s['site.name']}`,
    '',
    `> ${s['site.description'] || s['site.tagline']}`,
    '',
  ];

  if (isOn(s['gen.disclosure'])) {
    lines.push(`${s['gen.disclosureText']}`, '');
  }

  for (const cat of catRows) {
    if (Number(cat.count) === 0) continue;
    const catPosts = await db
      .select({ title: posts.title, slug: posts.slug, excerpt: posts.excerpt })
      .from(posts)
      .where(and(eq(posts.status, 'published'), eq(posts.categoryId, cat.id), eq(posts.noindex, false)))
      .orderBy(desc(posts.publishedAt))
      .limit(50);

    lines.push(`## ${cat.name}`, '');
    if (cat.description) lines.push(cat.description, '');
    for (const p of catPosts) {
      lines.push(`- [${p.title}](${base}/blog/${p.slug})${p.excerpt ? `: ${oneLine(p.excerpt)}` : ''}`);
    }
    lines.push('');
  }

  const uncategorised = await db
    .select({ title: posts.title, slug: posts.slug, excerpt: posts.excerpt })
    .from(posts)
    .where(and(eq(posts.status, 'published'), sql`${posts.categoryId} IS NULL`, eq(posts.noindex, false)))
    .orderBy(desc(posts.publishedAt))
    .limit(50);

  if (uncategorised.length) {
    lines.push('## Other articles', '');
    for (const p of uncategorised) {
      lines.push(`- [${p.title}](${base}/blog/${p.slug})${p.excerpt ? `: ${oneLine(p.excerpt)}` : ''}`);
    }
    lines.push('');
  }

  if (pageRows.length) {
    lines.push('## About this site', '');
    for (const p of pageRows) {
      lines.push(`- [${p.title}](${base}/${p.slug})${p.description ? `: ${oneLine(p.description)}` : ''}`);
    }
    lines.push('');
  }

  lines.push('## Optional', '', `- [Full sitemap](${base}/sitemap.xml)`, `- [RSS feed](${base}/feed.xml)`, '');

  if (s['llms.custom'].trim()) lines.push(s['llms.custom'].trim(), '');

  return new Response(lines.join('\n'), {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=0, s-maxage=3600' },
  });
}

const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, 160);
