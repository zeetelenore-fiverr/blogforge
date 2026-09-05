import { stripMarkdown, truncate } from '@/lib/util';

export type SchemaContext = {
  siteUrl: string;
  siteName: string;
  siteDescription: string;
  orgName: string;
  orgLogo: string;
  language: string;
  socialProfiles: string[];
};

export type PostForSchema = {
  title: string;
  slug: string;
  excerpt: string;
  metaDescription: string;
  contentMd: string;
  featuredImage?: string | null;
  featuredImageAlt?: string | null;
  publishedAt?: Date | null;
  updatedAt?: Date | null;
  wordCount: number;
  focusKeyword: string;
  secondaryKeywords: string[];
  schemaType?: string;
  category?: { name: string; slug: string } | null;
  author?: { name: string; slug: string; bio?: string | null; avatarUrl?: string | null } | null;
};

type Node = Record<string, unknown>;

const abs = (base: string, path: string) =>
  /^https?:\/\//i.test(path) ? path : `${base.replace(/\/+$/, '')}${path.startsWith('/') ? path : `/${path}`}`;

/**
 * One @graph per page with cross-referenced @ids — the shape Google's parsers
 * handle most reliably, and what the rich-results test expects.
 */
export function buildPostSchema(post: PostForSchema, ctx: SchemaContext): string {
  const url = abs(ctx.siteUrl, `/blog/${post.slug}`);
  const orgId = `${ctx.siteUrl}/#organization`;
  const siteId = `${ctx.siteUrl}/#website`;
  const pageId = `${url}#webpage`;
  const articleId = `${url}#article`;
  const authorId = post.author ? `${ctx.siteUrl}/author/${post.author.slug}#person` : orgId;

  const graph: Node[] = [];

  graph.push({
    '@type': 'Organization',
    '@id': orgId,
    name: ctx.orgName || ctx.siteName,
    url: ctx.siteUrl,
    ...(ctx.orgLogo
      ? {
          logo: {
            '@type': 'ImageObject',
            '@id': `${ctx.siteUrl}/#logo`,
            url: abs(ctx.siteUrl, ctx.orgLogo),
            contentUrl: abs(ctx.siteUrl, ctx.orgLogo),
          },
          image: { '@id': `${ctx.siteUrl}/#logo` },
        }
      : {}),
    ...(ctx.socialProfiles.length ? { sameAs: ctx.socialProfiles } : {}),
  });

  graph.push({
    '@type': 'WebSite',
    '@id': siteId,
    url: ctx.siteUrl,
    name: ctx.siteName,
    description: ctx.siteDescription,
    publisher: { '@id': orgId },
    inLanguage: ctx.language,
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${ctx.siteUrl}/search?q={search_term_string}` },
      'query-input': 'required name=search_term_string',
    },
  });

  if (post.author) {
    graph.push({
      '@type': 'Person',
      '@id': authorId,
      name: post.author.name,
      url: abs(ctx.siteUrl, `/author/${post.author.slug}`),
      ...(post.author.bio ? { description: post.author.bio } : {}),
      ...(post.author.avatarUrl
        ? { image: { '@type': 'ImageObject', url: abs(ctx.siteUrl, post.author.avatarUrl) } }
        : {}),
    });
  }

  const imageNode = post.featuredImage
    ? {
        '@type': 'ImageObject',
        '@id': `${url}#primaryimage`,
        url: abs(ctx.siteUrl, post.featuredImage),
        contentUrl: abs(ctx.siteUrl, post.featuredImage),
        caption: post.featuredImageAlt || post.title,
      }
    : null;
  if (imageNode) graph.push(imageNode);

  graph.push({
    '@type': 'BreadcrumbList',
    '@id': `${url}#breadcrumb`,
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: ctx.siteUrl },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: `${ctx.siteUrl}/blog` },
      ...(post.category
        ? [{
            '@type': 'ListItem',
            position: 3,
            name: post.category.name,
            item: abs(ctx.siteUrl, `/category/${post.category.slug}`),
          }]
        : []),
      { '@type': 'ListItem', position: post.category ? 4 : 3, name: post.title },
    ],
  });

  graph.push({
    '@type': 'WebPage',
    '@id': pageId,
    url,
    name: post.title,
    isPartOf: { '@id': siteId },
    ...(imageNode ? { primaryImageOfPage: { '@id': `${url}#primaryimage` } } : {}),
    datePublished: iso(post.publishedAt),
    dateModified: iso(post.updatedAt || post.publishedAt),
    breadcrumb: { '@id': `${url}#breadcrumb` },
    description: post.metaDescription || post.excerpt,
    inLanguage: ctx.language,
  });

  graph.push({
    '@type': post.schemaType || 'BlogPosting',
    '@id': articleId,
    isPartOf: { '@id': pageId },
    mainEntityOfPage: { '@id': pageId },
    headline: truncate(post.title, 110),
    description: post.metaDescription || post.excerpt,
    articleBody: truncate(stripMarkdown(post.contentMd), 5000),
    wordCount: post.wordCount,
    datePublished: iso(post.publishedAt),
    dateModified: iso(post.updatedAt || post.publishedAt),
    author: { '@id': authorId },
    publisher: { '@id': orgId },
    ...(imageNode ? { image: { '@id': `${url}#primaryimage` } } : {}),
    ...(post.category ? { articleSection: post.category.name } : {}),
    keywords: [post.focusKeyword, ...post.secondaryKeywords].filter(Boolean).join(', '),
    inLanguage: ctx.language,
  });

  const faq = extractFaq(post.contentMd);
  if (faq.length >= 2) {
    graph.push({
      '@type': 'FAQPage',
      '@id': `${url}#faq`,
      mainEntity: faq.map((f) => ({
        '@type': 'Question',
        name: f.question,
        acceptedAnswer: { '@type': 'Answer', text: f.answer },
      })),
    });
  }

  const howto = extractHowTo(post.contentMd);
  if (howto.length >= 3 && /^(how to|how do)/i.test(post.title)) {
    graph.push({
      '@type': 'HowTo',
      '@id': `${url}#howto`,
      name: post.title,
      step: howto.map((s, i) => ({
        '@type': 'HowToStep',
        position: i + 1,
        name: s.name,
        text: s.text,
      })),
    });
  }

  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph });
}

export function buildCollectionSchema(
  ctx: SchemaContext,
  opts: { url: string; name: string; description: string; items: { title: string; url: string }[] },
): string {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': `${opts.url}#webpage`,
        url: opts.url,
        name: opts.name,
        description: opts.description,
        isPartOf: { '@id': `${ctx.siteUrl}/#website` },
        inLanguage: ctx.language,
      },
      {
        '@type': 'ItemList',
        '@id': `${opts.url}#list`,
        itemListElement: opts.items.map((it, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          url: it.url,
          name: it.title,
        })),
      },
    ],
  });
}

/** Parse "## FAQ" sections where each ### is a question. */
export function extractFaq(md: string): { question: string; answer: string }[] {
  const out: { question: string; answer: string }[] = [];
  const faqStart = md.search(/^#{2,3}\s*(frequently asked questions|faqs?|common questions)/im);
  const scope = faqStart === -1 ? md : md.slice(faqStart);
  const re = /^#{3,4}\s+(.+?)\s*$\n([\s\S]*?)(?=^#{2,4}\s|(?![\s\S]))/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(scope))) {
    const question = m[1].replace(/[*_`]/g, '').trim();
    const answer = stripMarkdown(m[2]).trim();
    if (question.length > 5 && answer.length > 20 && /\?$/.test(question)) {
      out.push({ question, answer: truncate(answer, 900) });
    }
  }
  return out.slice(0, 10);
}

function extractHowTo(md: string): { name: string; text: string }[] {
  const re = /^#{2,3}\s+(?:step\s*\d+[:.\s-]*)(.+?)\s*$\n([\s\S]*?)(?=^#{2,3}\s|(?![\s\S]))/gim;
  const out: { name: string; text: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(md))) {
    out.push({ name: m[1].trim(), text: truncate(stripMarkdown(m[2]), 500) });
  }
  return out;
}

const iso = (d?: Date | null) => (d ? new Date(d).toISOString() : new Date().toISOString());
