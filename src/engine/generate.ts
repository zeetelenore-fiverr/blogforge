import 'server-only';
import { eq, sql } from 'drizzle-orm';
import {
  db, posts, tags, postTags, categories, users, media,
  type Campaign, type Post,
} from '@/db';
import { generateText, generateJson, generateImage } from '@/providers';
import { getSettings, isOn } from '@/lib/settings';
import { renderMarkdown } from '@/lib/markdown';
import { slugify, wordCount, readingTime, stripMarkdown, truncate, json } from '@/lib/util';
import { logInfo, logWarn, errMessage } from '@/lib/log';
import {
  DEFAULT_ARTICLE_PROMPT, OUTLINE_PROMPT, META_PROMPT, ALT_TEXT_PROMPT,
  IMAGE_PROMPT_TEMPLATE, SYSTEM_WRITER, fill,
} from './prompts';
import { analyzeSeo } from './seo-analyzer';
import { buildPostSchema, type SchemaContext } from './schema';
import { addInternalLinks, linkBackToNewPost } from './internal-links';
import { runPolicyCheck, applyPolicyGate } from './policy-runner';

export type GenerateOptions = {
  keyword: string;
  campaign?: Campaign | null;
  /** Overrides for a one-off manual generation. */
  overrides?: Partial<{
    title: string;
    wordCount: number;
    tone: string;
    audience: string;
    language: string;
    pointOfView: string;
    categoryId: number | null;
    authorId: number | null;
    publishStatus: 'draft' | 'published';
    scheduledFor: Date | null;
    promptTemplate: string;
    inlineImages: number;
    featuredImageEnabled: boolean;
    internalLinksEnabled: boolean;
    faqEnabled: boolean;
    keyTakeawaysEnabled: boolean;
  }>;
  onProgress?: (step: string) => void | Promise<void>;
};

type Outline = {
  title: string;
  searchIntent?: string;
  angle?: string;
  secondaryKeywords?: string[];
  outline?: { heading: string; level?: number; covers?: string }[];
  faq?: { question: string; answer?: string }[];
  keyTakeaways?: string[];
};

type Meta = {
  metaTitle?: string;
  metaDescription?: string;
  excerpt?: string;
  slug?: string;
  tags?: string[];
};

const IMAGE_PLACEHOLDER = /^\s*\[\[IMAGE:\s*([^|\]]+?)\s*(?:\|\s*([^\]]+?)\s*)?\]\]\s*$/gim;

/**
 * Full article pipeline: outline → draft → images + alt text → metadata →
 * internal links → schema → SEO score → saved post.
 *
 * Every step that can fail softly does. A missing image provider costs you the
 * images, not the article.
 */
export async function generateArticle(opts: GenerateOptions): Promise<Post> {
  const t0 = Date.now();
  const c = opts.campaign;
  const o = opts.overrides || {};
  const settings = await getSettings();
  const step = async (s: string) => { await opts.onProgress?.(s); };

  const keyword = opts.keyword.trim();
  const target = o.wordCount ?? c?.wordCount ?? Number(settings['gen.defaultWordCount']) ?? 1200;
  const tone = o.tone ?? c?.tone ?? 'friendly expert';
  const audience = o.audience ?? c?.audience ?? 'general readers';
  const language = o.language ?? c?.language ?? 'English';
  const pov = o.pointOfView ?? c?.pointOfView ?? 'second person';
  const categoryId = o.categoryId ?? c?.categoryId ?? null;
  const authorId = o.authorId ?? c?.authorId ?? null;
  const imageCount = o.inlineImages ?? c?.inlineImages ?? 3;
  const wantFeatured = o.featuredImageEnabled ?? c?.featuredImageEnabled ?? true;
  const wantLinks = o.internalLinksEnabled ?? c?.internalLinksEnabled ?? true;
  const maxLinks = c?.maxInternalLinks ?? 5;
  const wantFaq = o.faqEnabled ?? c?.faqEnabled ?? true;
  const wantTakeaways = o.keyTakeawaysEnabled ?? c?.keyTakeawaysEnabled ?? true;
  const pinnedText = c?.textProviderId ?? null;
  const pinnedImage = c?.imageProviderId ?? null;

  const category = categoryId
    ? (await db.select().from(categories).where(eq(categories.id, categoryId)))[0]
    : null;
  const author = authorId
    ? (await db.select().from(users).where(eq(users.id, authorId)))[0]
    : (await db.select().from(users).limit(1))[0];

  const meta: Record<string, unknown> = { keyword, providers: {} };

  /* ------------------------------------------------------- 1. outline */
  await step('Planning the outline');
  let outline: Outline;
  try {
    const res = await generateJson<Outline>(
      {
        system: SYSTEM_WRITER,
        prompt: fill(OUTLINE_PROMPT, { keyword, audience, language, wordCount: target }),
        maxTokens: 2500,
        temperature: 0.7,
      },
      { pinnedId: pinnedText, scope: 'generate' },
    );
    outline = res.data;
    (meta.providers as Record<string, string>).outline = res.provider.label;
  } catch (err) {
    await logWarn('generate', 'Outline step failed, using a minimal fallback outline', {
      keyword, error: errMessage(err),
    });
    outline = { title: titleCase(keyword), outline: [], secondaryKeywords: [] };
  }

  const title = o.title || outline.title || titleCase(keyword);
  const secondary = (outline.secondaryKeywords || []).slice(0, 10);

  /* --------------------------------------------------------- 2. draft */
  await step('Writing the article');
  const linkCandidates = wantLinks ? await candidateList() : '';
  const template = o.promptTemplate || c?.promptTemplate || settings['gen.defaultPrompt'] || DEFAULT_ARTICLE_PROMPT;

  const articlePrompt = fill(template, {
    keyword,
    title,
    outline: renderOutline(outline),
    wordCount: target,
    tone,
    audience,
    language,
    pov,
    secondaryKeywords: secondary.join(', ') || '—',
    internalLinks: linkCandidates || '(no published articles yet — skip internal links)',
    maxInternalLinks: maxLinks,
    siteName: settings['site.name'],
    category: category?.name || 'Blog',
    date: new Date().toISOString().slice(0, 10),
    imageCount,
  });

  const draft = await generateText(
    {
      system: SYSTEM_WRITER,
      prompt: articlePrompt,
      maxTokens: Math.min(16000, Math.max(4000, Math.round(target * 3))),
      temperature: 0.75,
    },
    { pinnedId: pinnedText, scope: 'generate' },
  );
  (meta.providers as Record<string, string>).article = draft.provider.label;

  let markdown = cleanDraft(draft.text, title);

  /* ------------------------------------- 3. extras the model may skip */
  if (wantTakeaways && outline.keyTakeaways?.length && !/key takeaways/i.test(markdown)) {
    const box = ['## Key takeaways', '', ...outline.keyTakeaways.map((t) => `- ${t}`), ''].join('\n');
    markdown = `${box}\n${markdown}`;
  }
  if (wantFaq && outline.faq?.length && !/^#{2,3}\s*(frequently asked|faq)/im.test(markdown)) {
    await step('Writing the FAQ');
    markdown += `\n\n${await buildFaqSection(outline.faq, keyword, pinnedText)}`;
  }

  /* -------------------------------------------------------- 4. images */
  await step('Generating images and alt text');
  const imageStyle = c?.imageStyle || settings['gen.imageStyle'];
  const generated: { url: string; alt: string; prompt: string; provider: string }[] = [];

  markdown = await replaceAsync(markdown, IMAGE_PLACEHOLDER, async (_m, briefRaw: string, altRaw?: string) => {
    const brief = briefRaw.trim();
    if (!brief) return '';
    const image = await generateImage(
      {
        prompt: fill(IMAGE_PROMPT_TEMPLATE, { brief, style: imageStyle }),
        width: 1200,
        height: 675,
        slug: slugify(`${keyword}-${brief}`, 50),
      },
      { pinnedId: pinnedImage, scope: 'generate' },
    );
    if (!image) return ''; // no image provider — drop the placeholder silently

    const alt = (altRaw || '').trim() || (await altTextFor(brief, keyword, title, pinnedText));
    generated.push({ url: image.url, alt, prompt: brief, provider: image.provider });
    const caption = image.attribution ? ` "${image.attribution}"` : '';
    return `![${alt.replace(/[[\]]/g, '')}](${image.url}${caption})`;
  });

  // Models drop the image placeholders more often than they follow them, and an
  // article with no in-body images reads as a wall of text. Top up from the
  // section headings so the requested count is a floor, not a wish.
  if (imageCount > 0 && generated.length < imageCount) {
    const topped = await topUpInlineImages(markdown, {
      needed: imageCount - generated.length,
      keyword,
      title,
      imageStyle,
      pinnedImage,
      pinnedText,
    });
    markdown = topped.markdown;
    generated.push(...topped.images);
  }

  let featuredImage: string | null = null;
  let featuredAlt: string | null = null;
  if (wantFeatured) {
    const brief = `${title}. ${outline.angle || keyword}`;
    const image = await generateImage(
      {
        prompt: fill(IMAGE_PROMPT_TEMPLATE, { brief, style: imageStyle }),
        width: 1200,
        height: 675,
        slug: slugify(keyword, 50),
      },
      { pinnedId: pinnedImage, scope: 'generate' },
    );
    if (image) {
      featuredImage = image.url;
      featuredAlt = await altTextFor(brief, keyword, title, pinnedText);
      generated.push({ url: image.url, alt: featuredAlt, prompt: brief, provider: image.provider });
      (meta.providers as Record<string, string>).image = image.provider;
    }
  }

  /* ---------------------------------------------------- 5. metadata */
  await step('Writing SEO metadata');
  let metaOut: Meta = {};
  try {
    const res = await generateJson<Meta>(
      {
        prompt: fill(META_PROMPT, {
          keyword,
          title,
          excerpt: truncate(stripMarkdown(markdown), 700),
        }),
        maxTokens: 800,
        temperature: 0.5,
      },
      { pinnedId: pinnedText, scope: 'generate' },
    );
    metaOut = res.data;
  } catch (err) {
    await logWarn('generate', 'Metadata step failed, deriving metadata locally', {
      error: errMessage(err),
    });
  }

  const metaTitle = clampTitle(metaOut.metaTitle || title, settings['site.name']);
  const excerpt = metaOut.excerpt?.trim() || truncate(stripMarkdown(markdown), 200);
  const metaDescription = clampDescription(metaOut.metaDescription || excerpt, keyword);
  const slug = await uniqueSlug(metaOut.slug || title || keyword);

  /* ----------------------------------------------- 6. internal links */
  let linkCount = 0;
  if (wantLinks) {
    await step('Adding internal links');
    const linked = await addInternalLinks(markdown, {
      title,
      focusKeyword: keyword,
      max: maxLinks,
      useAi: true,
    });
    markdown = linked.markdown;
    linkCount = linked.links.length;
  }

  /* -------------------------------------------- 7. AdSense policy review */
  await step('Reviewing against AdSense policies');
  const policy = await runPolicyCheck(
    {
      title,
      contentMd: markdown,
      excerpt,
      metaDescription,
      category: category?.name ?? null,
      hasDisclosure: isOn(settings['gen.disclosure']),
    },
    { useAi: isOn(settings['policy.aiReview']), pinnedText },
  );

  /* --------------------------------------------------- 8. assemble */
  await step('Rendering and scoring');
  const { html } = renderMarkdown(markdown);
  const words = wordCount(stripMarkdown(markdown));

  const report = analyzeSeo({
    title,
    slug,
    metaTitle,
    metaDescription,
    excerpt,
    contentMd: markdown,
    focusKeyword: keyword,
    secondaryKeywords: secondary,
    featuredImage,
    featuredImageAlt: featuredAlt,
    schemaJson: 'pending',
    internalLinkCount: 0,
  });

  const requested = o.publishStatus ?? c?.publishStatus ?? 'draft';
  const gate = await applyPolicyGate(policy, requested);
  const publishStatus = gate.status;
  const scheduledFor = gate.heldBack ? null : (o.scheduledFor ?? null);
  const status: Post['status'] = scheduledFor && scheduledFor.getTime() > Date.now()
    ? 'scheduled'
    : publishStatus === 'published'
      ? 'published'
      : 'draft';

  meta.ms = Date.now() - t0;
  meta.words = words;
  meta.policy = policy.status;
  meta.policyHeldBack = gate.heldBack;
  meta.imagesGenerated = generated.length;
  meta.internalLinks = linkCount;

  const [saved] = await db
    .insert(posts)
    .values({
      title,
      slug,
      excerpt,
      contentMd: markdown,
      contentHtml: html,
      status,
      publishedAt: status === 'published' ? new Date() : null,
      scheduledFor,
      categoryId,
      authorId: author?.id ?? null,
      campaignId: c?.id ?? null,
      focusKeyword: keyword,
      secondaryKeywords: JSON.stringify(secondary),
      featuredImage,
      featuredImageAlt: featuredAlt,
      metaTitle,
      metaDescription,
      schemaJson: '',
      seoScore: report.score,
      seoChecks: JSON.stringify(report.checks),
      policyStatus: policy.status,
      policyIssues: JSON.stringify(policy.issues),
      policyCheckedAt: new Date(),
      wordCount: words,
      readingTime: readingTime(words),
      generationMeta: JSON.stringify(meta),
    })
    .returning();

  /* -------------------------------------------------- 8. schema + tags */
  const schemaJson = buildPostSchema(
    {
      title, slug, excerpt, metaDescription, contentMd: markdown,
      featuredImage, featuredImageAlt: featuredAlt,
      publishedAt: saved.publishedAt ?? new Date(),
      updatedAt: saved.updatedAt,
      wordCount: words,
      focusKeyword: keyword,
      secondaryKeywords: secondary,
      schemaType: c?.schemaType || 'BlogPosting',
      category: category ? { name: category.name, slug: category.slug } : null,
      author: author ? { name: author.name, slug: author.slug, bio: author.bio, avatarUrl: author.avatarUrl } : null,
    },
    await schemaContext(),
  );
  await db.update(posts).set({ schemaJson }).where(eq(posts.id, saved.id));

  if (metaOut.tags?.length) await attachTags(saved.id, metaOut.tags);
  if (generated.length) {
    await db.insert(media).values(
      generated.map((g) => ({
        url: g.url, alt: g.alt, prompt: g.prompt, provider: g.provider, postId: saved.id,
      })),
    );
  }

  // Give the new post inbound links so it is not born an orphan.
  if (wantLinks && status === 'published') {
    await linkBackToNewPost({ ...saved, schemaJson }, 3).catch(() => 0);
  }

  await logInfo('generate', `Generated "${title}"`, {
    keyword, words, score: report.score, policy: policy.status,
    heldBack: gate.heldBack, ms: meta.ms, postId: saved.id,
  });

  return { ...saved, schemaJson };
}

/* -------------------------------------------------------------- helpers */

/** Strip preambles, stray H1s and leftover fences the model sometimes adds. */
function cleanDraft(raw: string, title: string): string {
  let md = raw.trim();
  md = md.replace(/^```(?:markdown|md)?\s*\n/i, '').replace(/\n```\s*$/i, '');
  md = md.replace(/^(?:here(?:'s| is)[^\n]*|sure[^\n]*|certainly[^\n]*)\n+/i, '');
  // Remove a duplicated H1 title at the top; the template renders the title.
  md = md.replace(/^#\s+.+\n+/, (m) =>
    m.toLowerCase().includes(title.toLowerCase().slice(0, 20)) ? '' : m,
  );
  md = md.replace(/^#\s+/gm, '## ');
  return md.trim();
}

function renderOutline(o: Outline): string {
  if (!o.outline?.length) return '(no outline — structure the article yourself)';
  return o.outline
    .map((s) => `${s.level === 3 ? '  - H3' : '- H2'}: ${s.heading}${s.covers ? ` — ${s.covers}` : ''}`)
    .join('\n');
}

async function buildFaqSection(
  faq: { question: string; answer?: string }[],
  keyword: string,
  pinnedId: number | null,
): Promise<string> {
  const needsAnswers = faq.filter((f) => !f.answer || f.answer.length < 40);
  let answers = faq;

  if (needsAnswers.length) {
    try {
      const { data } = await generateJson<{ faq?: { question: string; answer: string }[] }>(
        {
          system: SYSTEM_WRITER,
          prompt:
            `Answer these questions about "${keyword}". Each answer must be 40-70 words, direct, ` +
            `specific and self-contained (it may be shown as a featured snippet).\n\n` +
            faq.map((f) => `- ${f.question}`).join('\n') +
            `\n\nReturn JSON only: { "faq": [ { "question": "...", "answer": "..." } ] }`,
          maxTokens: 2000,
          temperature: 0.6,
        },
        { pinnedId, scope: 'generate' },
      );
      if (data.faq?.length) answers = data.faq;
    } catch {
      /* keep whatever the outline gave us */
    }
  }

  const body = answers
    .filter((f) => f.question && f.answer)
    .map((f) => `### ${f.question.replace(/^#+\s*/, '')}\n\n${f.answer}`)
    .join('\n\n');
  return body ? `## Frequently asked questions\n\n${body}` : '';
}

/** Headings that carry no visual subject worth illustrating. */
const UNILLUSTRATABLE = /^(frequently asked|faq|key takeaways|what to do next|conclusion|summary)/i;

/**
 * Add in-body images by picking section headings and generating one image per
 * section, spread evenly through the article rather than clustered at the top.
 * Fails soft: no image provider simply means fewer images.
 */
async function topUpInlineImages(
  markdown: string,
  opts: {
    needed: number;
    keyword: string;
    title: string;
    imageStyle: string;
    pinnedImage: number | null;
    pinnedText: number | null;
  },
): Promise<{ markdown: string; images: { url: string; alt: string; prompt: string; provider: string }[] }> {
  const lines = markdown.split('\n');
  const images: { url: string; alt: string; prompt: string; provider: string }[] = [];

  // Candidate insertion points: after the first paragraph of an H2 section that
  // does not already contain an image.
  const candidates: { line: number; heading: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^##\s+(.+)$/.exec(lines[i]);
    if (!m) continue;
    const heading = m[1].replace(/[*_`]/g, '').trim();
    if (UNILLUSTRATABLE.test(heading)) continue;

    let j = i + 1;
    while (j < lines.length && !lines[j].trim()) j++;
    // Walk past the paragraph that introduces the section.
    while (j < lines.length && lines[j].trim() && !/^#{2,3}\s/.test(lines[j])) j++;
    if (j >= lines.length) continue;

    // Skip if this section already shows an image.
    const window = lines.slice(i, Math.min(j + 3, lines.length)).join('\n');
    if (/!\[[^\]]*\]\(/.test(window)) continue;

    candidates.push({ line: j, heading });
  }

  if (!candidates.length) return { markdown, images };

  // Spread the picks across the article instead of taking the first N.
  const take = Math.min(opts.needed, candidates.length);
  const stride = candidates.length / take;
  const chosen = Array.from({ length: take }, (_, n) => candidates[Math.floor(n * stride)]);

  const inserts: { line: number; text: string }[] = [];
  for (const c of chosen) {
    const brief = `${c.heading}, in the context of ${opts.keyword}`;
    const image = await generateImage(
      {
        prompt: fill(IMAGE_PROMPT_TEMPLATE, { brief, style: opts.imageStyle }),
        width: 1200,
        height: 675,
        slug: slugify(`${opts.keyword}-${c.heading}`, 50),
      },
      { pinnedId: opts.pinnedImage, scope: 'generate' },
    );
    if (!image) break; // provider is down — stop rather than retrying per section

    const alt = await altTextFor(brief, opts.keyword, opts.title, opts.pinnedText);
    images.push({ url: image.url, alt, prompt: brief, provider: image.provider });
    inserts.push({ line: c.line, text: `\n![${alt.replace(/[[\]]/g, '')}](${image.url})\n` });
  }

  // Apply bottom-up so earlier line numbers stay valid.
  for (const ins of inserts.sort((a, b) => b.line - a.line)) {
    lines.splice(ins.line, 0, ins.text);
  }

  return { markdown: lines.join('\n'), images };
}

async function altTextFor(
  brief: string,
  keyword: string,
  context: string,
  pinnedId: number | null,
): Promise<string> {
  try {
    const { data } = await generateJson<{ alt?: string }>(
      {
        prompt: fill(ALT_TEXT_PROMPT, { keyword, context, brief }),
        maxTokens: 200,
        temperature: 0.4,
      },
      { pinnedId, scope: 'generate' },
    );
    const alt = (data.alt || '').trim();
    if (alt.length >= 8) return truncate(alt, 125);
  } catch {
    /* fall through to the deterministic version */
  }
  // Never ship an image without alt text, even if every provider is down.
  return truncate(`${brief.replace(/\.$/, '')} — ${keyword}`, 125);
}

async function candidateList(): Promise<string> {
  const rows = await db
    .select({ title: posts.title, slug: posts.slug, keyword: posts.focusKeyword })
    .from(posts)
    .where(eq(posts.status, 'published'))
    .orderBy(sql`${posts.publishedAt} DESC`)
    .limit(25);
  return rows.map((r) => `- "${r.title}" → /blog/${r.slug}`).join('\n');
}

export async function uniqueSlug(base: string, ignorePostId?: number): Promise<string> {
  const root = slugify(base) || 'post';
  let candidate = root;
  for (let n = 2; n < 100; n++) {
    const [clash] = await db.select({ id: posts.id }).from(posts).where(eq(posts.slug, candidate));
    if (!clash || clash.id === ignorePostId) return candidate;
    candidate = `${root}-${n}`;
  }
  return `${root}-${Date.now().toString(36)}`;
}

async function attachTags(postId: number, names: string[]) {
  for (const raw of names.slice(0, 8)) {
    const name = raw.trim().toLowerCase();
    if (!name || name.length > 40) continue;
    const slug = slugify(name, 40);
    if (!slug) continue;
    let [tag] = await db.select().from(tags).where(eq(tags.slug, slug));
    if (!tag) [tag] = await db.insert(tags).values({ name, slug }).returning();
    await db.insert(postTags).values({ postId, tagId: tag.id }).onConflictDoNothing();
  }
}

export async function schemaContext(): Promise<SchemaContext> {
  const s = await getSettings();
  return {
    siteUrl: (s['site.url'] || 'http://localhost:3000').replace(/\/+$/, ''),
    siteName: s['site.name'],
    siteDescription: s['site.description'],
    orgName: s['org.name'] || s['site.name'],
    orgLogo: s['org.logo'] || s['site.logoUrl'],
    language: s['site.language'] || 'en',
    socialProfiles: [
      s['social.twitter'], s['social.facebook'], s['social.linkedin'],
      s['social.youtube'], s['social.instagram'],
    ].filter(Boolean),
  };
}

function clampTitle(t: string, siteName: string): string {
  let out = t.trim().replace(/^["']|["']$/g, '');
  if (out.endsWith(`| ${siteName}`)) out = out.slice(0, -`| ${siteName}`.length).trim();
  return out.length > 60 ? truncate(out, 60) : out;
}

function clampDescription(d: string, keyword: string): string {
  let out = d.trim().replace(/\s+/g, ' ').replace(/^["']|["']$/g, '');
  if (!out.toLowerCase().includes(keyword.toLowerCase()) && out.length < 130) {
    out = `${out} ${keyword}.`.trim();
  }
  if (out.length > 158) out = truncate(out, 158);
  return out;
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** String.replace with an async replacer. */
async function replaceAsync(
  input: string,
  re: RegExp,
  fn: (...args: string[]) => Promise<string>,
): Promise<string> {
  const matches = [...input.matchAll(re)];
  if (!matches.length) return input;
  const replacements = await Promise.all(
    matches.map((m) => fn(...(m as unknown as string[]))),
  );
  let out = '';
  let last = 0;
  matches.forEach((m, i) => {
    out += input.slice(last, m.index) + replacements[i];
    last = (m.index ?? 0) + m[0].length;
  });
  return out + input.slice(last);
}

/** Recompute score, schema and HTML after a manual or automated edit. */
export async function refreshPostDerived(postId: number): Promise<Post | null> {
  const [post] = await db.select().from(posts).where(eq(posts.id, postId));
  if (!post) return null;

  const category = post.categoryId
    ? (await db.select().from(categories).where(eq(categories.id, post.categoryId)))[0]
    : null;
  const author = post.authorId
    ? (await db.select().from(users).where(eq(users.id, post.authorId)))[0]
    : null;

  const { html } = renderMarkdown(post.contentMd);
  const words = wordCount(stripMarkdown(post.contentMd));
  const secondary = json<string[]>(post.secondaryKeywords, []);

  const schemaJson = buildPostSchema(
    {
      title: post.title, slug: post.slug, excerpt: post.excerpt,
      metaDescription: post.metaDescription, contentMd: post.contentMd,
      featuredImage: post.featuredImage, featuredImageAlt: post.featuredImageAlt,
      publishedAt: post.publishedAt, updatedAt: new Date(),
      wordCount: words, focusKeyword: post.focusKeyword, secondaryKeywords: secondary,
      category: category ? { name: category.name, slug: category.slug } : null,
      author: author ? { name: author.name, slug: author.slug, bio: author.bio, avatarUrl: author.avatarUrl } : null,
    },
    await schemaContext(),
  );

  const report = analyzeSeo({
    title: post.title, slug: post.slug, metaTitle: post.metaTitle,
    metaDescription: post.metaDescription, excerpt: post.excerpt,
    contentMd: post.contentMd, focusKeyword: post.focusKeyword,
    secondaryKeywords: secondary, featuredImage: post.featuredImage,
    featuredImageAlt: post.featuredImageAlt, schemaJson,
    canonicalUrl: post.canonicalUrl, noindex: post.noindex,
  });

  const [updated] = await db
    .update(posts)
    .set({
      contentHtml: html,
      wordCount: words,
      readingTime: readingTime(words),
      schemaJson,
      seoScore: report.score,
      seoChecks: JSON.stringify(report.checks),
      updatedAt: new Date(),
    })
    .where(eq(posts.id, postId))
    .returning();

  return updated;
}
