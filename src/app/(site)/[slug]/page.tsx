import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { db, pages } from '@/db';
import { renderMarkdown } from '@/lib/markdown';
import { formatDate } from '@/lib/util';
import { Breadcrumbs, JsonLd } from '@/components/site/chrome';
import { schemaContext } from '@/engine/generate';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }> };

async function load(slug: string) {
  const [row] = await db
    .select()
    .from(pages)
    .where(and(eq(pages.slug, slug), eq(pages.status, 'published')));
  return row ?? null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = await load(slug);
  if (!page) return { title: 'Not found', robots: { index: false } };
  return {
    title: page.metaTitle || page.title,
    description: page.metaDescription || undefined,
    alternates: { canonical: `/${page.slug}` },
  };
}

/** Static pages: About, Contact, Privacy Policy — the ones AdSense looks for. */
export default async function StaticPage({ params }: Props) {
  const { slug } = await params;
  const page = await load(slug);
  if (!page) notFound();

  const { html } = renderMarkdown(page.contentMd);
  const ctx = await schemaContext();

  return (
    <div className="mx-auto max-w-3xl px-[var(--gutter)] py-12">
      <JsonLd
        json={JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: page.title,
          url: `${ctx.siteUrl}/${page.slug}`,
          description: page.metaDescription || undefined,
          isPartOf: { '@type': 'WebSite', name: ctx.siteName, url: ctx.siteUrl },
          dateModified: new Date(page.updatedAt).toISOString(),
        })}
      />
      <Breadcrumbs trail={[{ name: 'Home', href: '/' }, { name: page.title }]} />
      <h1 className="headline text-[clamp(2rem,5vw,3.25rem)]">{page.title}</h1>
      <p className="mt-3 text-xs" style={{ color: 'var(--ink-3)' }}>
        Last updated {formatDate(page.updatedAt)}
      </p>
      <div className="prose-article mt-8" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
