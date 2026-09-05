import { stripMarkdown, wordCount } from '@/lib/util';
import { extractImages, extractLinks } from '@/lib/markdown';

export type CheckStatus = 'pass' | 'warn' | 'fail';

export type SeoCheck = {
  id: string;
  group: 'meta' | 'content' | 'keyword' | 'structure' | 'media' | 'links' | 'technical';
  label: string;
  status: CheckStatus;
  weight: number;
  message: string;
  /** Shown in the UI and fed to the AI fixer. */
  fix?: string;
};

export type SeoInput = {
  title: string;
  slug: string;
  metaTitle: string;
  metaDescription: string;
  excerpt: string;
  contentMd: string;
  focusKeyword: string;
  secondaryKeywords?: string[];
  featuredImage?: string | null;
  featuredImageAlt?: string | null;
  schemaJson?: string;
  canonicalUrl?: string | null;
  noindex?: boolean;
  internalLinkCount?: number;
};

export type SeoReport = {
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  checks: SeoCheck[];
  stats: {
    words: number;
    readingTime: number;
    density: number;
    headings: number;
    images: number;
    internalLinks: number;
    externalLinks: number;
    readability: number;
    avgSentenceWords: number;
  };
};

/** Runs every on-page check locally. No network, no key, no cost. */
export function analyzeSeo(input: SeoInput): SeoReport {
  const checks: SeoCheck[] = [];
  const kw = input.focusKeyword.trim().toLowerCase();
  const md = input.contentMd || '';
  const plain = stripMarkdown(md);
  const plainLower = plain.toLowerCase();
  const words = wordCount(plain);

  const headings = [...md.matchAll(/^(#{2,6})\s+(.+)$/gm)].map((m) => ({
    level: m[1].length,
    text: m[2].trim(),
  }));
  const images = extractImages(md);
  const links = extractLinks(md);
  const internalLinks = links.filter((l) => l.href.startsWith('/') || l.href.startsWith('#')).length
    + (input.internalLinkCount ?? 0);
  const externalLinks = links.filter((l) => /^https?:\/\//i.test(l.href)).length;

  const occurrences = kw ? countPhrase(plainLower, kw) : 0;
  const density = words ? (occurrences * kw.split(/\s+/).length * 100) / words : 0;

  const push = (c: SeoCheck) => checks.push(c);

  /* ------------------------------------------------------------- meta */
  const metaTitle = input.metaTitle || input.title;
  const mtLen = metaTitle.length;
  push({
    id: 'meta-title-length',
    group: 'meta',
    label: 'Meta title length',
    weight: 3,
    status: mtLen >= 30 && mtLen <= 60 ? 'pass' : mtLen > 0 && mtLen <= 70 ? 'warn' : 'fail',
    message: `${mtLen} characters (ideal 50–60).`,
    fix: mtLen > 60 ? 'Shorten the meta title so Google does not truncate it.' : mtLen < 30 ? 'Expand the meta title — it is wasting SERP real estate.' : undefined,
  });
  push({
    id: 'meta-title-keyword',
    group: 'keyword',
    label: 'Focus keyword in meta title',
    weight: 4,
    status: !kw ? 'warn' : metaTitle.toLowerCase().includes(kw) ? 'pass' : 'fail',
    message: kw ? (metaTitle.toLowerCase().includes(kw) ? 'Present.' : `"${kw}" is missing.`) : 'No focus keyword set.',
    fix: kw && !metaTitle.toLowerCase().includes(kw) ? `Work "${kw}" into the meta title, ideally in the first half.` : undefined,
  });
  push({
    id: 'meta-title-position',
    group: 'keyword',
    label: 'Keyword near the start of the title',
    weight: 1,
    status: !kw ? 'warn' : metaTitle.toLowerCase().indexOf(kw) <= 30 && metaTitle.toLowerCase().includes(kw) ? 'pass' : 'warn',
    message: 'Front-loaded keywords carry slightly more weight and survive truncation.',
  });

  const mdLen = input.metaDescription.length;
  push({
    id: 'meta-desc-length',
    group: 'meta',
    label: 'Meta description length',
    weight: 3,
    status: mdLen >= 120 && mdLen <= 160 ? 'pass' : mdLen > 0 ? 'warn' : 'fail',
    message: `${mdLen} characters (ideal 140–158).`,
    fix: mdLen === 0 ? 'Add a meta description — Google will otherwise scrape an arbitrary sentence.' : mdLen > 160 ? 'Trim the meta description to under 158 characters.' : undefined,
  });
  push({
    id: 'meta-desc-keyword',
    group: 'keyword',
    label: 'Focus keyword in meta description',
    weight: 2,
    status: !kw ? 'warn' : input.metaDescription.toLowerCase().includes(kw) ? 'pass' : 'warn',
    message: input.metaDescription.toLowerCase().includes(kw) ? 'Present.' : 'Missing — the bolded match improves click-through.',
    fix: kw && !input.metaDescription.toLowerCase().includes(kw) ? `Include "${kw}" in the meta description.` : undefined,
  });

  /* -------------------------------------------------------------- slug */
  push({
    id: 'slug-keyword',
    group: 'keyword',
    label: 'Focus keyword in URL slug',
    weight: 2,
    status: !kw ? 'warn' : input.slug.includes(kw.replace(/\s+/g, '-')) ? 'pass' : 'warn',
    message: input.slug || '(no slug)',
    fix: kw && !input.slug.includes(kw.replace(/\s+/g, '-')) ? 'Use a slug built from the focus keyword.' : undefined,
  });
  push({
    id: 'slug-length',
    group: 'technical',
    label: 'Slug is short and readable',
    weight: 1,
    status: input.slug.length > 0 && input.slug.length <= 60 ? 'pass' : 'warn',
    message: `${input.slug.length} characters.`,
  });

  /* ----------------------------------------------------------- content */
  push({
    id: 'word-count',
    group: 'content',
    label: 'Article length',
    weight: 4,
    status: words >= 900 ? 'pass' : words >= 500 ? 'warn' : 'fail',
    message: `${words} words.`,
    fix: words < 900 ? 'Add depth — thin pages struggle to rank and to pass AdSense review.' : undefined,
  });

  push({
    id: 'keyword-density',
    group: 'keyword',
    label: 'Keyword density',
    weight: 3,
    status: !kw ? 'warn' : density >= 0.5 && density <= 2.5 ? 'pass' : density > 0 ? 'warn' : 'fail',
    message: `${density.toFixed(2)}% (${occurrences} occurrences; ideal 0.5–2.5%).`,
    fix: density > 2.5 ? 'Reduce repetition — this reads as keyword stuffing.' : density < 0.5 ? `Use "${kw}" a few more times where it reads naturally.` : undefined,
  });

  const first100 = plainLower.split(/\s+/).slice(0, 100).join(' ');
  push({
    id: 'keyword-intro',
    group: 'keyword',
    label: 'Keyword in the first 100 words',
    weight: 3,
    status: !kw ? 'warn' : first100.includes(kw) ? 'pass' : 'fail',
    message: first100.includes(kw) ? 'Present.' : 'Missing from the opening.',
    fix: kw && !first100.includes(kw) ? `Mention "${kw}" in the first paragraph.` : undefined,
  });

  const kwInHeading = headings.some((h) => h.text.toLowerCase().includes(kw));
  push({
    id: 'keyword-heading',
    group: 'keyword',
    label: 'Keyword in a subheading',
    weight: 2,
    status: !kw ? 'warn' : kwInHeading ? 'pass' : 'warn',
    message: kwInHeading ? 'Present in at least one H2/H3.' : 'No subheading contains the focus keyword.',
    fix: kw && !kwInHeading ? `Rewrite one H2 to include "${kw}".` : undefined,
  });

  const secondaryHit = (input.secondaryKeywords || []).filter((s) => plainLower.includes(s.toLowerCase())).length;
  const secondaryTotal = (input.secondaryKeywords || []).length;
  push({
    id: 'secondary-keywords',
    group: 'keyword',
    label: 'Supporting keyword coverage',
    weight: 2,
    status: !secondaryTotal ? 'warn' : secondaryHit / secondaryTotal >= 0.6 ? 'pass' : 'warn',
    message: `${secondaryHit}/${secondaryTotal} supporting terms appear in the body.`,
    fix: secondaryTotal && secondaryHit / secondaryTotal < 0.6 ? 'Cover more of the related terms — it widens the queries this page can match.' : undefined,
  });

  /* --------------------------------------------------------- structure */
  const h2s = headings.filter((h) => h.level === 2).length;
  push({
    id: 'headings-count',
    group: 'structure',
    label: 'Subheadings',
    weight: 3,
    status: h2s >= 3 ? 'pass' : h2s >= 1 ? 'warn' : 'fail',
    message: `${h2s} H2 sections, ${headings.length} headings total.`,
    fix: h2s < 3 ? 'Break the article into more scannable H2 sections.' : undefined,
  });

  let skipped = false;
  for (let i = 1; i < headings.length; i++) {
    if (headings[i].level - headings[i - 1].level > 1) skipped = true;
  }
  push({
    id: 'heading-order',
    group: 'structure',
    label: 'Heading levels are not skipped',
    weight: 1,
    status: skipped ? 'warn' : 'pass',
    message: skipped ? 'A heading level is skipped (e.g. H2 → H4).' : 'Hierarchy is clean.',
    fix: skipped ? 'Fix the heading hierarchy so levels step by one.' : undefined,
  });

  const dupes = headings.length - new Set(headings.map((h) => h.text.toLowerCase())).size;
  push({
    id: 'heading-unique',
    group: 'structure',
    label: 'Headings are unique',
    weight: 1,
    status: dupes === 0 ? 'pass' : 'warn',
    message: dupes === 0 ? 'All headings are distinct.' : `${dupes} duplicate heading(s).`,
  });

  const paragraphs = md.split(/\n{2,}/).filter((p) => p.trim() && !p.trim().startsWith('#'));
  const longParas = paragraphs.filter((p) => wordCount(p) > 150).length;
  push({
    id: 'paragraph-length',
    group: 'content',
    label: 'Paragraph length',
    weight: 2,
    status: longParas === 0 ? 'pass' : longParas <= 2 ? 'warn' : 'fail',
    message: longParas ? `${longParas} paragraph(s) over 150 words.` : 'All paragraphs are scannable.',
    fix: longParas ? 'Split the long paragraphs — mobile readers bounce off walls of text.' : undefined,
  });

  push({
    id: 'has-list',
    group: 'structure',
    label: 'Contains a list',
    weight: 1,
    status: /^\s*([-*+]|\d+\.)\s+/m.test(md) ? 'pass' : 'warn',
    message: /^\s*([-*+]|\d+\.)\s+/m.test(md) ? 'Present.' : 'No bulleted or numbered list found.',
  });

  push({
    id: 'has-table',
    group: 'structure',
    label: 'Contains a comparison table',
    weight: 1,
    status: /\n\s*\|.+\|\s*\n\s*\|[\s:|-]+\|/.test(md) ? 'pass' : 'warn',
    message: /\n\s*\|.+\|\s*\n\s*\|[\s:|-]+\|/.test(md) ? 'Present.' : 'No table — tables win featured snippets.',
  });

  /* -------------------------------------------------------- readability */
  const sentences = plain.split(/[.!?]+\s/).filter((s) => s.trim().length > 3);
  const avgSentenceWords = sentences.length ? words / sentences.length : 0;
  const syllables = countSyllables(plainLower);
  const readability = sentences.length && words
    ? 206.835 - 1.015 * (words / sentences.length) - 84.6 * (syllables / words)
    : 0;

  push({
    id: 'readability',
    group: 'content',
    label: 'Readability (Flesch)',
    weight: 2,
    status: readability >= 55 ? 'pass' : readability >= 40 ? 'warn' : 'fail',
    message: `Score ${readability.toFixed(0)} — ${readabilityLabel(readability)}.`,
    fix: readability < 55 ? 'Shorten sentences and prefer plain words.' : undefined,
  });
  push({
    id: 'sentence-length',
    group: 'content',
    label: 'Average sentence length',
    weight: 1,
    status: avgSentenceWords > 0 && avgSentenceWords <= 22 ? 'pass' : 'warn',
    message: `${avgSentenceWords.toFixed(1)} words per sentence (aim under 22).`,
  });

  /* -------------------------------------------------------------- media */
  push({
    id: 'featured-image',
    group: 'media',
    label: 'Featured image',
    weight: 3,
    status: input.featuredImage ? 'pass' : 'fail',
    message: input.featuredImage ? 'Set.' : 'Missing — needed for social cards and article schema.',
    fix: !input.featuredImage ? 'Generate or upload a featured image.' : undefined,
  });
  push({
    id: 'featured-image-alt',
    group: 'media',
    label: 'Featured image alt text',
    weight: 2,
    status: !input.featuredImage ? 'warn' : input.featuredImageAlt && input.featuredImageAlt.length > 8 ? 'pass' : 'fail',
    message: input.featuredImageAlt || 'No alt text.',
    fix: input.featuredImage && !input.featuredImageAlt ? 'Add descriptive alt text to the featured image.' : undefined,
  });

  const missingAlt = images.filter((i) => !i.alt || i.alt.trim().length < 5).length;
  push({
    id: 'image-alt',
    group: 'media',
    label: 'Inline images have alt text',
    weight: 3,
    status: images.length === 0 ? 'warn' : missingAlt === 0 ? 'pass' : 'fail',
    message: images.length ? `${images.length - missingAlt}/${images.length} images have alt text.` : 'No inline images.',
    fix: missingAlt ? 'Add alt text to every inline image — accessibility and image search both depend on it.' : undefined,
  });
  // Two to three in-body images is the house standard: it breaks up the text,
  // gives image search something to index, and keeps the page from reading as a
  // wall. The featured image does not count towards it.
  push({
    id: 'image-count',
    group: 'media',
    label: 'In-article images',
    weight: 2,
    status: images.length >= 2 ? 'pass' : images.length === 1 ? 'warn' : 'fail',
    message: `${images.length} image(s) in the body for ${words} words (target 2–3).`,
    fix:
      images.length < 2
        ? 'Add in-article images — the generator inserts these automatically, so a shortfall usually means the image provider was unavailable.'
        : undefined,
  });

  /* -------------------------------------------------------------- links */
  push({
    id: 'internal-links',
    group: 'links',
    label: 'Internal links',
    weight: 3,
    status: internalLinks >= 2 ? 'pass' : internalLinks === 1 ? 'warn' : 'fail',
    message: `${internalLinks} internal link(s).`,
    fix: internalLinks < 2 ? 'Link to at least two related posts — it spreads authority and keeps readers on site.' : undefined,
  });
  push({
    id: 'external-links',
    group: 'links',
    label: 'External references',
    weight: 1,
    status: externalLinks >= 1 ? 'pass' : 'warn',
    message: `${externalLinks} outbound link(s).`,
    fix: externalLinks === 0 ? 'Cite at least one authoritative source.' : undefined,
  });
  const badAnchors = links.filter((l) => /^(click here|read more|here|this|link)$/i.test(l.text.trim())).length;
  push({
    id: 'anchor-quality',
    group: 'links',
    label: 'Descriptive anchor text',
    weight: 1,
    status: badAnchors === 0 ? 'pass' : 'warn',
    message: badAnchors ? `${badAnchors} generic anchor(s).` : 'All anchors are descriptive.',
    fix: badAnchors ? 'Replace generic anchors like "click here" with descriptive phrases.' : undefined,
  });

  /* ---------------------------------------------------------- technical */
  push({
    id: 'schema',
    group: 'technical',
    label: 'Structured data',
    weight: 3,
    status: input.schemaJson && input.schemaJson.length > 40 ? 'pass' : 'fail',
    message: input.schemaJson && input.schemaJson.length > 40 ? 'JSON-LD present.' : 'No schema markup.',
    fix: !input.schemaJson ? 'Generate Article/FAQ schema for rich results.' : undefined,
  });
  push({
    id: 'indexable',
    group: 'technical',
    label: 'Page is indexable',
    weight: 5,
    status: input.noindex ? 'fail' : 'pass',
    message: input.noindex ? 'noindex is set — Google will not index this page.' : 'Indexable.',
    fix: input.noindex ? 'Remove noindex once the article is ready.' : undefined,
  });
  push({
    id: 'excerpt',
    group: 'meta',
    label: 'Excerpt set',
    weight: 1,
    status: input.excerpt.length >= 60 ? 'pass' : 'warn',
    message: input.excerpt ? `${input.excerpt.length} characters.` : 'No excerpt.',
  });
  push({
    id: 'faq',
    group: 'structure',
    label: 'FAQ section',
    weight: 2,
    status: /^#{2,3}\s*(frequently asked|faq)/im.test(md) ? 'pass' : 'warn',
    message: /^#{2,3}\s*(frequently asked|faq)/im.test(md) ? 'Present.' : 'No FAQ section — FAQ schema is an easy rich-result win.',
  });

  /* -------------------------------------------------------------- score */
  const max = checks.reduce((s, c) => s + c.weight, 0);
  const earned = checks.reduce(
    (s, c) => s + (c.status === 'pass' ? c.weight : c.status === 'warn' ? c.weight * 0.5 : 0),
    0,
  );
  const score = max ? Math.round((earned / max) * 100) : 0;

  return {
    score,
    grade: score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 55 ? 'D' : 'F',
    checks,
    stats: {
      words,
      readingTime: Math.max(1, Math.round(words / 225)),
      density: Number(density.toFixed(2)),
      headings: headings.length,
      images: images.length + (input.featuredImage ? 1 : 0),
      internalLinks,
      externalLinks,
      readability: Number(readability.toFixed(0)),
      avgSentenceWords: Number(avgSentenceWords.toFixed(1)),
    },
  };
}

function countPhrase(haystack: string, needle: string): number {
  if (!needle) return 0;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (haystack.match(new RegExp(`\\b${escaped}\\b`, 'g')) || []).length;
}

function countSyllables(text: string): number {
  const words = text.match(/[a-z]+/g) || [];
  let total = 0;
  for (const w of words) {
    const groups = w.replace(/e$/, '').match(/[aeiouy]+/g);
    total += Math.max(1, groups ? groups.length : 1);
  }
  return total || 1;
}

function readabilityLabel(score: number): string {
  if (score >= 80) return 'very easy';
  if (score >= 60) return 'plain English';
  if (score >= 50) return 'fairly difficult';
  if (score >= 30) return 'difficult';
  return 'very difficult';
}
