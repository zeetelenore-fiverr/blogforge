import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import { slugify, escapeHtml } from './util';

export type Heading = { level: number; text: string; id: string };

const ALLOWED_TAGS = [
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'a', 'ul', 'ol', 'li', 'blockquote', 'strong', 'em', 'del', 'code', 'pre',
  'hr', 'br', 'img', 'figure', 'figcaption', 'table', 'thead', 'tbody', 'tfoot',
  'tr', 'th', 'td', 'span', 'div', 'sup', 'sub', 'mark', 'section', 'details', 'summary',
];

/** Convert generated markdown to the HTML we store and serve. */
export function renderMarkdown(md: string): { html: string; headings: Heading[] } {
  const headings: Heading[] = [];
  const used = new Set<string>();

  const renderer = new marked.Renderer();

  renderer.heading = ({ tokens, depth }) => {
    const text = stripTags(marked.parseInline(tokens.map((t) => t.raw).join(''), { async: false }) as string);
    let id = slugify(text, 60) || `section-${headings.length + 1}`;
    let n = 2;
    while (used.has(id)) id = `${id}-${n++}`;
    used.add(id);
    headings.push({ level: depth, text, id });
    const inner = marked.parseInline(tokens.map((t) => t.raw).join(''), { async: false }) as string;
    return `<h${depth} id="${id}">${inner}</h${depth}>\n`;
  };

  // Every image gets alt text, lazy loading and explicit dimensions hints so
  // CLS stays low — both are ranking-relevant.
  renderer.image = ({ href, title, text }) => {
    const alt = escapeHtml(text || title || '');
    const src = escapeHtml(href || '');
    const cap = title ? `<figcaption>${escapeHtml(title)}</figcaption>` : '';
    return `<figure class="post-figure"><img src="${src}" alt="${alt}" loading="lazy" decoding="async" />${cap}</figure>`;
  };

  renderer.link = ({ href, title, tokens }) => {
    const inner = marked.parseInline(tokens.map((t) => t.raw).join(''), { async: false }) as string;
    const url = href || '';
    const external = /^https?:\/\//i.test(url);
    const rel = external ? ' rel="noopener nofollow" target="_blank"' : '';
    const t = title ? ` title="${escapeHtml(title)}"` : '';
    return `<a href="${escapeHtml(url)}"${t}${rel}>${inner}</a>`;
  };

  const raw = marked.parse(md || '', { renderer, gfm: true, breaks: false, async: false }) as string;

  const html = sanitizeHtml(raw, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ['href', 'title', 'rel', 'target'],
      img: ['src', 'alt', 'title', 'loading', 'decoding', 'width', 'height'],
      '*': ['id', 'class'],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'data'],
    transformTags: {
      // The page already renders the post title as <h1>; demote stray ones.
      h1: 'h2',
    },
  });

  return { html, headings };
}

export function buildToc(headings: Heading[]): string {
  const items = headings.filter((h) => h.level === 2 || h.level === 3);
  if (items.length < 3) return '';
  const lis = items
    .map(
      (h) =>
        `<li class="toc-l${h.level}"><a href="#${h.id}">${escapeHtml(h.text)}</a></li>`,
    )
    .join('');
  return `<nav class="toc" aria-label="Table of contents"><p class="toc-title">Table of contents</p><ol>${lis}</ol></nav>`;
}

function stripTags(s: string) {
  return s.replace(/<[^>]*>/g, '').trim();
}

/** Pull `![alt](src)` pairs out of markdown — used by the SEO alt-text audit. */
export function extractImages(md: string): { alt: string; src: string }[] {
  const out: { alt: string; src: string }[] = [];
  const re = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md))) out.push({ alt: m[1], src: m[2] });
  return out;
}

export function extractLinks(md: string): { text: string; href: string }[] {
  const out: { text: string; href: string }[] = [];
  const re = /(?<!!)\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md))) out.push({ text: m[1], href: m[2] });
  return out;
}
