import { stripMarkdown, wordCount, truncate } from '@/lib/util';
import { extractImages, extractLinks } from '@/lib/markdown';

/**
 * AdSense programme-policy review, run on every article as it is written.
 *
 * This is a screening tool, not a ruling. Google reviews sites by hand and by
 * its own classifiers; nothing here can promise approval. What it does do is
 * catch the failures that actually get publishers rejected — restricted
 * subject matter, thin or templated pages, missing disclaimers on
 * health/financial claims, and the "scaled content abuse" pattern that AI
 * publishing falls into most easily — before the article is live.
 *
 * Deterministic, local, and free. An optional model pass adds judgement on top.
 */

export type PolicySeverity = 'blocker' | 'warning' | 'note';

export type PolicyIssue = {
  id: string;
  severity: PolicySeverity;
  /** Which policy family this belongs to, in Google's own vocabulary. */
  policy: string;
  title: string;
  detail: string;
  /** What the writer or the auto-fixer should do about it. */
  remedy: string;
  /** Words or phrases that triggered it, for a human to sanity-check. */
  evidence?: string[];
};

export type PolicyReport = {
  status: 'pass' | 'review' | 'fail';
  score: number; // 0-100, how comfortable this page looks for monetisation
  issues: PolicyIssue[];
  checkedAt: string;
};

export type PolicyInput = {
  title: string;
  contentMd: string;
  excerpt?: string;
  metaDescription?: string;
  category?: string | null;
  hasDisclosure?: boolean;
};

/* ------------------------------------------------------- restricted topics */

/**
 * Each family maps to a real AdSense content policy. Terms are matched as whole
 * words on the plain-text body. `threshold` is how many distinct hits it takes
 * before the topic looks like the subject of the page rather than a passing
 * mention — a cooking article that says "knife" once is not a weapons page.
 */
type TopicRule = {
  id: string;
  policy: string;
  severity: PolicySeverity;
  title: string;
  terms: string[];
  threshold: number;
  remedy: string;
};

const RESTRICTED: TopicRule[] = [
  {
    id: 'adult',
    policy: 'Sexually explicit content',
    severity: 'blocker',
    title: 'Possible adult content',
    terms: ['pornography', 'porn', 'xxx', 'escort service', 'nude photos', 'sex tape', 'onlyfans', 'camgirl', 'hentai'],
    threshold: 1,
    remedy: 'AdSense does not monetise sexually explicit pages. Remove this subject matter or keep the page out of the ad inventory.',
  },
  {
    id: 'shocking',
    policy: 'Shocking content',
    severity: 'blocker',
    title: 'Graphic or shocking material',
    terms: ['gore', 'beheading', 'mutilated', 'graphic violence', 'crime scene photo', 'dismembered', 'execution video'],
    threshold: 1,
    remedy: 'Remove the graphic description. Google demonetises pages that dwell on violence or bodily harm.',
  },
  {
    id: 'hateful',
    policy: 'Dangerous or derogatory content',
    severity: 'blocker',
    title: 'Potentially derogatory content',
    terms: ['racial slur', 'ethnic cleansing', 'white supremacy', 'subhuman', 'inferior race', 'holocaust denial'],
    threshold: 1,
    remedy: 'Remove content that disparages a group. This is one of the fastest routes to an account-level action.',
  },
  {
    id: 'weapons',
    policy: 'Weapons and explosives',
    severity: 'blocker',
    title: 'Weapons or explosives instruction',
    terms: ['how to build a bomb', 'make explosives', 'ghost gun', 'silencer build', 'ammunition reloading', 'convert to full auto', '3d printed gun'],
    threshold: 1,
    remedy: 'Instructions for making weapons or explosives are prohibited outright. Remove the section.',
  },
  {
    id: 'drugs',
    policy: 'Recreational drugs',
    severity: 'warning',
    title: 'Recreational drug references',
    terms: ['cocaine', 'heroin', 'methamphetamine', 'magic mushrooms', 'lsd', 'buy weed', 'cannabis dispensary', 'psilocybin', 'legal high'],
    threshold: 2,
    remedy: 'Recreational drug content is restricted. Cover it clinically or expect limited ad serving on this page.',
  },
  {
    id: 'alcohol-tobacco',
    policy: 'Alcohol and tobacco',
    severity: 'note',
    title: 'Alcohol or tobacco as the subject',
    terms: ['vape juice', 'e-cigarette', 'nicotine pouch', 'buy cigarettes', 'hard liquor', 'shots of vodka', 'best whiskey to buy'],
    threshold: 3,
    remedy: 'Alcohol and tobacco are restricted rather than banned — ad serving may be limited depending on the country.',
  },
  {
    id: 'gambling',
    policy: 'Gambling and games',
    severity: 'warning',
    title: 'Gambling content',
    terms: ['online casino', 'betting odds', 'free spins', 'no deposit bonus', 'sportsbook', 'poker bonus', 'slot machine tips', 'betting tips'],
    threshold: 2,
    remedy: 'Gambling pages need a licence and country targeting before Google will monetise them. Most small blogs should avoid this.',
  },
  {
    id: 'hacking',
    policy: 'Enabling dishonest behaviour',
    severity: 'blocker',
    title: 'Hacking, cracking or circumvention',
    terms: ['crack software', 'keygen', 'serial key free', 'bypass paywall', 'pirated', 'torrent download', 'nulled theme', 'free premium account', 'hack someone', 'account cracking'],
    threshold: 1,
    remedy: 'Circumvention and piracy content is prohibited. Remove it — this is an account-level risk, not just a page-level one.',
  },
  {
    id: 'counterfeit',
    policy: 'Counterfeit goods',
    severity: 'blocker',
    title: 'Counterfeit or replica goods',
    terms: ['replica watch', 'fake designer', 'knockoff bag', 'first copy', 'superfake', 'counterfeit'],
    threshold: 1,
    remedy: 'Promoting counterfeit goods is prohibited and will get the site removed.',
  },
  {
    id: 'medical-claims',
    policy: 'Misrepresentative content — health claims',
    severity: 'warning',
    title: 'Unqualified health claims',
    terms: ['cures cancer', 'miracle cure', 'guaranteed weight loss', 'doctors hate', 'reverse diabetes', 'cure covid', 'detox your body', 'big pharma doesn'],
    threshold: 1,
    remedy: 'Remove or qualify the claim, cite a source, and add a "not medical advice" line. Unproven health claims are a documented rejection reason.',
  },
  {
    id: 'financial-claims',
    policy: 'Misrepresentative content — financial claims',
    severity: 'warning',
    title: 'Get-rich-quick framing',
    terms: ['get rich quick', 'guaranteed returns', 'risk free investment', 'double your money', 'passive income overnight', 'financial freedom in days', 'no risk profit'],
    threshold: 1,
    remedy: 'Drop the guarantee. Promising returns is treated as misrepresentation.',
  },
];

/* --------------------------------------------------- disclaimer triggers */

const YMYL_TOPICS: { id: string; label: string; terms: string[]; disclaimer: string }[] = [
  {
    id: 'medical',
    label: 'health or medical',
    terms: ['symptom', 'diagnosis', 'treatment', 'dosage', 'medication', 'side effect', 'therapy', 'supplement', 'prescription', 'disease'],
    disclaimer: 'not medical advice',
  },
  {
    id: 'financial',
    label: 'financial',
    terms: ['investment', 'portfolio', 'stocks', 'crypto', 'mortgage', 'tax return', 'retirement fund', 'interest rate', 'loan'],
    disclaimer: 'not financial advice',
  },
  {
    id: 'legal',
    label: 'legal',
    terms: ['lawsuit', 'attorney', 'legal rights', 'court filing', 'liability', 'statute', 'contract law'],
    disclaimer: 'not legal advice',
  },
];

/* ------------------------------------------------------------- the check */

export function checkAdsensePolicy(input: PolicyInput): PolicyReport {
  const issues: PolicyIssue[] = [];
  const md = input.contentMd || '';
  const plain = stripMarkdown(md);
  const lower = plain.toLowerCase();
  const words = wordCount(plain);

  /* -------------------------------------------- restricted subject matter */
  for (const rule of RESTRICTED) {
    const hits = rule.terms.filter((t) => containsPhrase(lower, t));
    if (hits.length >= rule.threshold) {
      issues.push({
        id: rule.id,
        severity: rule.severity,
        policy: rule.policy,
        title: rule.title,
        detail: `Matched ${hits.length} restricted term${hits.length === 1 ? '' : 's'} for this policy family.`,
        remedy: rule.remedy,
        evidence: hits.slice(0, 6),
      });
    }
  }

  /* --------------------------------------------------- valuable inventory */
  // "Low value content" is the single most common AdSense rejection.
  if (words < 600) {
    issues.push({
      id: 'thin-content',
      severity: words < 350 ? 'blocker' : 'warning',
      policy: 'Valuable inventory — low value content',
      title: 'Page is thin',
      detail: `${words} words. Google's reviewers reject sites whose pages carry little original substance.`,
      remedy: 'Expand to at least 700 words of genuinely useful detail, or leave the page out of the ad inventory.',
    });
  }

  const headings = [...md.matchAll(/^#{2,6}\s+(.+)$/gm)].map((m) => m[1]);
  if (headings.length < 3 && words > 400) {
    issues.push({
      id: 'no-structure',
      severity: 'note',
      policy: 'Valuable inventory — navigability',
      title: 'Very little structure',
      detail: `${headings.length} subheading(s) across ${words} words.`,
      remedy: 'Break the article into scannable sections. Reviewers read structure as a proxy for effort.',
    });
  }

  /* ------------------------------------------------- scaled content abuse */
  // The pattern Google names explicitly for AI publishing: many pages that say
  // the same thing with the words moved around.
  const sentences = plain.split(/[.!?]+\s/).filter((s) => s.trim().length > 25);
  const normalised = sentences.map((s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim());
  const duplicates = normalised.length - new Set(normalised).size;
  if (duplicates > 2) {
    issues.push({
      id: 'repetition',
      severity: 'warning',
      policy: 'Spam policies — scaled content abuse',
      title: 'Repeated sentences',
      detail: `${duplicates} sentence(s) appear more than once.`,
      remedy: 'Cut the repetition. Padding an article by restating it is the exact pattern Google calls scaled content abuse.',
    });
  }

  const filler = [
    'in today’s fast-paced world', 'in this article, we will', 'without further ado',
    'it is important to note that', 'in conclusion', 'last but not least',
    'when it comes to', 'the world of', 'delve into', 'in the realm of',
  ].filter((f) => lower.includes(f));
  if (filler.length >= 3) {
    issues.push({
      id: 'filler',
      severity: 'note',
      policy: 'Valuable inventory — original content',
      title: 'Reads as generic AI filler',
      detail: `${filler.length} stock phrases found.`,
      remedy: 'Rewrite these openings with something specific. Reviewers recognise this vocabulary immediately.',
      evidence: filler.slice(0, 5),
    });
  }

  /* --------------------------------------------------------- YMYL topics */
  for (const topic of YMYL_TOPICS) {
    const hits = topic.terms.filter((t) => containsPhrase(lower, t));
    if (hits.length < 3) continue;
    const hasDisclaimer = new RegExp(
      `${topic.disclaimer}|consult (a|your) (doctor|physician|professional|advisor|solicitor|lawyer)|seek professional|qualified professional`,
      'i',
    ).test(plain);
    if (!hasDisclaimer) {
      issues.push({
        id: `ymyl-${topic.id}`,
        severity: 'warning',
        policy: 'Misrepresentative content — YMYL',
        title: `${cap(topic.label)} topic without a disclaimer`,
        detail: `This page covers ${topic.label} subject matter, which Google holds to a higher standard.`,
        remedy: `Add a short line stating this is ${topic.disclaimer} and that readers should consult a qualified professional.`,
        evidence: hits.slice(0, 5),
      });
    }
  }

  /* ------------------------------------------------------ transparency */
  if (input.hasDisclosure === false) {
    issues.push({
      id: 'no-ai-disclosure',
      severity: 'note',
      policy: 'Transparency',
      title: 'No AI disclosure shown',
      detail: 'The site-wide AI disclosure is switched off.',
      remedy: 'Turn the disclosure back on in Settings → Generation. Undisclosed automated content is a common rejection reason.',
    });
  }

  /* ------------------------------------------------------------- links */
  const links = extractLinks(md);
  const affiliate = links.filter((l) => /[?&](tag|ref|aff|affiliate|utm_medium=affiliate)=/i.test(l.href));
  if (affiliate.length && !/affiliate|commission|we may earn|paid link/i.test(plain)) {
    issues.push({
      id: 'affiliate-undisclosed',
      severity: 'warning',
      policy: 'Transparency — paid relationships',
      title: 'Affiliate links without disclosure',
      detail: `${affiliate.length} link(s) carry affiliate parameters.`,
      remedy: 'Add an affiliate disclosure near the top. This is an FTC requirement as well as a Google expectation.',
    });
  }

  const external = links.filter((l) => /^https?:\/\//i.test(l.href));
  if (external.length > 25) {
    issues.push({
      id: 'link-spam',
      severity: 'warning',
      policy: 'Spam policies — link spam',
      title: 'Unusually high outbound link count',
      detail: `${external.length} external links.`,
      remedy: 'Trim to the sources that genuinely support the article.',
    });
  }

  /* ------------------------------------------------------------ images */
  const images = extractImages(md);
  const missingAlt = images.filter((i) => !i.alt || i.alt.trim().length < 5).length;
  if (missingAlt > 0) {
    issues.push({
      id: 'image-alt',
      severity: 'note',
      policy: 'Valuable inventory — accessibility',
      title: 'Images without alt text',
      detail: `${missingAlt} of ${images.length} images have no usable alt text.`,
      remedy: 'Add alt text to every image.',
    });
  }

  /* ------------------------------------------------------ clickbait title */
  if (/\b(you won'?t believe|shocking|this one trick|doctors hate|gone wrong|number \d+ will)\b/i.test(input.title)) {
    issues.push({
      id: 'clickbait',
      severity: 'warning',
      policy: 'Misrepresentative content — clickbait',
      title: 'Clickbait headline',
      detail: `"${truncate(input.title, 80)}"`,
      remedy: 'Rewrite the title to describe what the article actually delivers.',
    });
  }

  return summarise(issues);
}

/** Fold a set of issues into a status and a score. */
export function summarise(issues: PolicyIssue[]): PolicyReport {
  const blockers = issues.filter((i) => i.severity === 'blocker').length;
  const warnings = issues.filter((i) => i.severity === 'warning').length;
  const notes = issues.filter((i) => i.severity === 'note').length;

  const score = Math.max(0, 100 - blockers * 40 - warnings * 12 - notes * 4);
  const status: PolicyReport['status'] = blockers > 0 ? 'fail' : warnings > 0 ? 'review' : 'pass';

  return { status, score, issues, checkedAt: new Date().toISOString() };
}

/* ----------------------------------------------------------- AI review */

export const POLICY_REVIEW_PROMPT = `You are reviewing an article against Google AdSense programme policies before it is published.

Title: {{title}}
Category: {{category}}

Article:
{{content}}

Judge it against these policies only:
- Sexually explicit, shocking, or violent content
- Dangerous or derogatory content (hate, harassment, threats)
- Weapons, explosives, recreational drugs, tobacco, gambling
- Enabling dishonest behaviour (hacking, piracy, academic cheating, circumvention)
- Counterfeit goods
- Misrepresentative content: unsupported medical or financial claims, clickbait, fabricated statistics
- Valuable inventory: is this a page a reader would find genuinely useful, or filler?
- Spam policies: scaled content abuse — mass-produced pages with no added value

Return JSON only:
{
  "verdict": "pass | review | fail",
  "reasoning": "two sentences on the overall judgement",
  "issues": [
    {
      "severity": "blocker | warning | note",
      "policy": "which policy family",
      "title": "short label",
      "detail": "what in the article triggers this, quoting briefly",
      "remedy": "the specific edit that would fix it"
    }
  ]
}

Be strict about real policy violations and relaxed about ordinary subject matter.
A cooking article that mentions a knife is not a weapons page. A health article
that cites sources and includes a disclaimer is fine. Only flag what would
actually cost this site its AdSense approval. If nothing does, return "pass" with
an empty issues array.`;

/** Merge a model verdict into a deterministic report. */
export function mergeAiReview(
  base: PolicyReport,
  ai: { verdict?: string; reasoning?: string; issues?: Partial<PolicyIssue>[] },
): PolicyReport {
  const extra: PolicyIssue[] = (ai.issues || [])
    .filter((i) => i?.title)
    .map((i, n) => ({
      id: `ai-${n}`,
      severity: (['blocker', 'warning', 'note'].includes(String(i.severity))
        ? i.severity
        : 'warning') as PolicySeverity,
      policy: i.policy || 'Model review',
      title: i.title!,
      detail: i.detail || '',
      remedy: i.remedy || 'Review this section by hand.',
    }));

  const merged = summarise([...base.issues, ...extra]);
  // The model may see something the term list cannot; never let it downgrade.
  if (ai.verdict === 'fail' && merged.status !== 'fail') {
    return { ...merged, status: 'fail', score: Math.min(merged.score, 55) };
  }
  return merged;
}

/* ---------------------------------------------------------------- utils */

function containsPhrase(haystack: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}`, 'i').test(haystack);
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const POLICY_STATUS_LABEL: Record<string, string> = {
  unchecked: 'Not checked',
  pass: 'Policy clear',
  review: 'Needs review',
  fail: 'Policy risk',
};
