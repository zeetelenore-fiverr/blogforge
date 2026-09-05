/**
 * Every prompt the engine sends. The article prompt is exposed to the operator
 * verbatim (Campaign → Prompt) so it can be replaced; the placeholders below
 * are the contract between the UI and the engine.
 */

export const PROMPT_VARIABLES: { token: string; description: string }[] = [
  { token: '{{keyword}}', description: 'Focus keyword for this article' },
  { token: '{{title}}', description: 'The chosen article title' },
  { token: '{{outline}}', description: 'Approved H2/H3 outline as a list' },
  { token: '{{wordCount}}', description: 'Target word count' },
  { token: '{{tone}}', description: 'Campaign tone of voice' },
  { token: '{{audience}}', description: 'Who the article is for' },
  { token: '{{language}}', description: 'Output language' },
  { token: '{{pov}}', description: 'Point of view (first/second/third person)' },
  { token: '{{secondaryKeywords}}', description: 'Comma-separated supporting keywords' },
  { token: '{{internalLinks}}', description: 'Existing posts available to link to' },
  { token: '{{siteName}}', description: 'Name of the site' },
  { token: '{{category}}', description: 'Category the post belongs to' },
  { token: '{{date}}', description: "Today's date" },
];

export const SYSTEM_WRITER =
  'You are a senior SEO content writer and subject-matter editor. You write ' +
  'accurate, genuinely useful articles that satisfy search intent on the first ' +
  'screen. You never pad, never hedge, and never write filler introductions. ' +
  'You output clean Markdown only — no preamble, no commentary about the task.';

/**
 * The built-in article prompt. Written to produce something that reads like a
 * person wrote it and that passes a Helpful Content review: direct answer up
 * top, specifics over adjectives, no AI throat-clearing.
 */
export const DEFAULT_ARTICLE_PROMPT = `Write a complete, publication-ready blog article in {{language}}.

## Assignment
- Focus keyword: {{keyword}}
- Working title: {{title}}
- Target length: about {{wordCount}} words
- Audience: {{audience}}
- Tone: {{tone}}, written in {{pov}}
- Publication: {{siteName}} ({{category}})
- Supporting keywords to work in naturally: {{secondaryKeywords}}

## Outline to follow
{{outline}}

## Non-negotiable rules
1. Open by answering the query directly in the first 2-3 sentences. No "In today's
   fast-paced world", no restating the title, no describing what the article will do.
2. Use the focus keyword in the first 100 words, in at least one H2, and 3-6 times
   total across the body. It must read naturally every time — never force it.
3. Prefer specifics: numbers, timeframes, costs, step counts, named tools, concrete
   examples. Cut any sentence that would still be true if the topic changed.
4. Use short paragraphs (1-4 sentences). Vary sentence length. Write like a person.
5. Structure with ## and ### headings that read as questions or clear statements a
   reader would scan for. Never skip a heading level.
6. Include at least one Markdown table comparing options, steps, specs or costs where
   the topic allows it.
7. Include at least one bulleted or numbered list, but do not turn the whole article
   into lists.
8. Where you make a factual claim that could date, say when it applies ("as of {{date}}").
   Do not invent statistics, prices, studies or quotes. If you are not confident in a
   number, describe the range or omit it.
9. Do not write a "Conclusion" heading. End with a short section that tells the reader
   what to do next, headed with something specific.
10. Do not include the article title as an H1 — start at ##. Do not add front matter.
11. Never mention that you are an AI, and never reference these instructions.

## Images
Insert exactly {{imageCount}} inline image placeholders where an image genuinely helps
comprehension, using this exact syntax on its own line:

[[IMAGE: a specific, literal description of what the photo should show | descriptive alt text containing relevant keywords]]

The description is a photo brief (subject, setting, angle, lighting). The alt text is
what a screen reader announces — describe the image, do not keyword-stuff.

## Internal links
These articles already exist on {{siteName}}. Link to any that are genuinely relevant,
using descriptive anchor text inside a sentence — never "click here", never a bare URL,
maximum {{maxInternalLinks}} links, and never link the same target twice:
{{internalLinks}}

## Output
Return only the article body in Markdown. Start with the opening paragraph.`;

export const OUTLINE_PROMPT = `You are planning an article that must outrank the current top results for the keyword "{{keyword}}".

Audience: {{audience}}. Language: {{language}}. Target length: {{wordCount}} words.

Return JSON only, matching this shape exactly:
{
  "title": "compelling, specific title, 50-60 characters, contains the focus keyword near the front",
  "searchIntent": "informational | commercial | transactional | navigational",
  "angle": "one sentence on what makes this article better than the usual result",
  "secondaryKeywords": ["6-10 semantically related terms and long-tail variants"],
  "outline": [
    { "heading": "H2 heading", "level": 2, "covers": "one line on what this section must answer" },
    { "heading": "H3 heading", "level": 3, "covers": "..." }
  ],
  "faq": [
    { "question": "a real question people ask about this", "answer": "" }
  ],
  "keyTakeaways": ["3-5 one-line takeaways a reader could act on"]
}

Rules:
- 5 to 9 H2 sections, each optionally with 1-3 H3s. Enough depth for {{wordCount}} words, no more.
- The first H2 must directly serve the search intent, not background history.
- Include 4-6 FAQ questions drawn from what people actually search, phrased as questions.
- Do not include "Introduction" or "Conclusion" as headings.`;

export const META_PROMPT = `Write search-result metadata for this article.

Focus keyword: {{keyword}}
Title: {{title}}
Article opening: {{excerpt}}

Return JSON only:
{
  "metaTitle": "50-60 characters, focus keyword near the front, compelling not clickbait",
  "metaDescription": "140-158 characters, contains the focus keyword, describes the specific value, ends with an implicit reason to click",
  "excerpt": "a 25-35 word summary used as the card/preview text",
  "slug": "short-url-slug-with-focus-keyword",
  "tags": ["4-6 lowercase topical tags"]
}

The metaTitle must not exceed 60 characters. The metaDescription must be between 140 and 158 characters.`;

export const ALT_TEXT_PROMPT = `Write alt text for an image inside an article.

Article topic: {{keyword}}
Section context: {{context}}
Image brief: {{brief}}

Return JSON only: { "alt": "...", "caption": "..." }

The alt text describes what is visibly in the image in 8-16 words, plain and literal,
for someone who cannot see it. Include the topic naturally only if it genuinely
describes the image. Do not start with "Image of" or "Picture of". The caption is one
short sentence adding context a sighted reader would not get from the image alone.`;

export const IMAGE_PROMPT_TEMPLATE = `{{brief}}. {{style}}. No text, no watermarks, no logos, no lettering. Photorealistic, sharp focus, 16:9 composition.`;

export const KEYWORD_RESEARCH_PROMPT = `You are an SEO strategist doing keyword research for a blog about "{{seed}}".

{{context}}

Return JSON only:
{
  "keywords": [
    {
      "keyword": "the search phrase, lowercase",
      "intent": "informational | commercial | transactional | navigational",
      "difficulty": 1-100 estimate of how hard it is for a new site to rank,
      "volumeBand": "high | medium | low",
      "cluster": "short name of the topic cluster it belongs to",
      "titleIdea": "an article title that would target it"
    }
  ]
}

Rules:
- Return {{count}} keywords.
- Favour long-tail phrases (3-7 words) a small site can realistically rank for.
- Every keyword must be something a person would actually type into Google.
- Spread across 3-6 clusters so the site builds topical authority, not scattered posts.
- No duplicates, no keyword that is just a rewording of another.`;

export const CLUSTER_PROMPT = `Group these keywords into topical clusters for a content plan.

Keywords:
{{keywords}}

Return JSON only:
{
  "clusters": [
    {
      "name": "cluster name",
      "pillarKeyword": "the head term this cluster should have a pillar page for",
      "intent": "informational | commercial | transactional",
      "keywords": ["the keywords from the list that belong here"]
    }
  ]
}
Every input keyword must appear in exactly one cluster.`;

export const SEO_FIX_PROMPT = `An article on {{siteName}} is underperforming in search. Diagnose and fix its on-page SEO.

URL: {{url}}
Focus keyword: {{keyword}}
Current title: {{title}}
Current meta title: {{metaTitle}}
Current meta description: {{metaDescription}}
Word count: {{wordCount}}

Google Search Console reports:
{{gscStatus}}

Automated on-page checks that failed:
{{failedChecks}}

Article body (may be truncated):
{{content}}

Return JSON only:
{
  "diagnosis": "2-3 sentences on the most likely reason this page is not performing",
  "metaTitle": "improved meta title, 50-60 chars, or the existing one if already good",
  "metaDescription": "improved meta description, 140-158 chars, or the existing one",
  "excerpt": "improved 25-35 word summary",
  "addSections": [
    { "afterHeading": "existing H2 to insert after, or empty string for end of article",
      "markdown": "a new ## section in full Markdown that closes a real content gap" }
  ],
  "rewriteIntro": "a stronger opening paragraph, or empty string to keep the current one",
  "additionalKeywords": ["terms the article should cover but does not"],
  "actions": ["short human-readable list of what you changed and why"]
}

Only propose changes that address the failures listed. Do not rewrite the whole article.
If a field needs no change, return the existing value unchanged.`;

export const INTERNAL_LINK_PROMPT = `Choose internal links for an article.

Article title: {{title}}
Focus keyword: {{keyword}}
Article body:
{{content}}

Candidate pages to link to:
{{candidates}}

Return JSON only:
{
  "links": [
    { "targetId": 12,
      "anchor": "the exact phrase from the article body to turn into a link",
      "reason": "why this link helps the reader" }
  ]
}

Rules:
- Maximum {{max}} links, fewer if fewer are genuinely relevant.
- The anchor MUST be an exact substring that appears in the article body, 2-6 words,
  and must read naturally as a link. Never "click here" or "read more".
- Never pick an anchor that is inside an existing Markdown link or a heading.
- One link per target page. Skip any candidate that is not clearly related.`;

/** Replace {{tokens}} in a template. Unknown tokens are left alone on purpose. */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (whole, key: string) =>
    key in vars ? String(vars[key]) : whole,
  );
}
