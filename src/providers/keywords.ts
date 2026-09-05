import 'server-only';
import { fetchWithTimeout } from '@/lib/util';
import { ProviderError, httpError } from './text';
import type { RuntimeProvider, KeywordSuggestion } from './types';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz'.split('');
const QUESTIONS = ['how', 'what', 'why', 'when', 'where', 'which', 'who', 'can', 'is', 'does', 'should'];
const MODIFIERS = ['best', 'vs', 'for', 'near', 'without', 'with', 'cost', 'review', 'alternative', 'tips'];

/** HTTP keyword sources. AI-based expansion lives in engine/keywords.ts. */
export async function callKeywords(
  p: RuntimeProvider,
  seed: string,
  limit = 60,
): Promise<KeywordSuggestion[]> {
  switch (p.adapter) {
    case 'google-suggest':
      return googleSuggest(seed, limit);
    case 'datamuse':
      return datamuse(seed, limit);
    case 'wikipedia':
      return wikipedia(seed, limit);
    case 'serper':
      return serper(p, seed, limit);
    case 'serpapi':
      return serpapi(p, seed, limit);
    default:
      throw new ProviderError(`Unknown keyword adapter: ${p.adapter}`);
  }
}

/**
 * The classic keyword-tool trick: ask Google's autocomplete for the seed plus
 * every letter, question word and modifier. Keyless, and the suggestions are
 * real queries weighted by how often people type them.
 */
export async function googleSuggest(seed: string, limit = 60): Promise<KeywordSuggestion[]> {
  const probes = [
    seed,
    ...QUESTIONS.map((q) => `${q} ${seed}`),
    ...MODIFIERS.map((m) => `${seed} ${m}`),
    ...ALPHABET.map((a) => `${seed} ${a}`),
  ];

  const found = new Map<string, KeywordSuggestion>();
  // Small concurrency: enough to be quick, low enough not to look like a scraper.
  const batches = chunk(probes, 6);
  for (const batch of batches) {
    if (found.size >= limit) break;
    const results = await Promise.allSettled(batch.map(fetchSuggest));
    for (const r of results) {
      if (r.status !== 'fulfilled') continue;
      for (const kw of r.value) {
        const key = kw.toLowerCase().trim();
        if (!key || found.has(key)) continue;
        found.set(key, {
          keyword: key,
          source: 'google-suggest',
          seed,
          intent: guessIntent(key),
        });
      }
    }
  }
  return [...found.values()].slice(0, limit);
}

async function fetchSuggest(q: string): Promise<string[]> {
  const url = `https://suggestqueries.google.com/complete/search?client=firefox&hl=en&q=${encodeURIComponent(q)}`;
  const res = await fetchWithTimeout(url, {
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; BlogForge/1.0)' },
  }, 12_000);
  if (!res.ok) return [];
  const text = await res.text();
  try {
    const data = JSON.parse(text) as [string, string[]];
    return Array.isArray(data?.[1]) ? data[1] : [];
  } catch {
    return [];
  }
}

async function datamuse(seed: string, limit: number): Promise<KeywordSuggestion[]> {
  const calls = [
    `https://api.datamuse.com/words?ml=${encodeURIComponent(seed)}&max=${limit}`,
    `https://api.datamuse.com/words?rel_trg=${encodeURIComponent(seed)}&max=${limit}`,
  ];
  const out = new Map<string, KeywordSuggestion>();
  for (const url of calls) {
    const res = await fetchWithTimeout(url, {}, 15_000);
    if (!res.ok) continue;
    const rows = (await res.json()) as { word: string; score?: number }[];
    for (const r of rows) {
      const key = r.word.toLowerCase();
      if (out.has(key)) continue;
      out.set(key, { keyword: key, source: 'datamuse', seed, intent: 'informational' });
    }
  }
  return [...out.values()].slice(0, limit);
}

async function wikipedia(seed: string, limit: number): Promise<KeywordSuggestion[]> {
  const search = await fetchWithTimeout(
    `https://en.wikipedia.org/w/api.php?action=opensearch&format=json&limit=5&search=${encodeURIComponent(seed)}`,
    { headers: { 'user-agent': 'BlogForge/1.0' } },
    15_000,
  );
  if (!search.ok) return [];
  const [, titles] = (await search.json()) as [string, string[]];
  const out: KeywordSuggestion[] = [];

  for (const title of titles.slice(0, 2)) {
    const res = await fetchWithTimeout(
      `https://en.wikipedia.org/w/api.php?action=parse&format=json&prop=sections&page=${encodeURIComponent(title)}`,
      { headers: { 'user-agent': 'BlogForge/1.0' } },
      15_000,
    );
    if (!res.ok) continue;
    const data = (await res.json()) as { parse?: { sections?: { line: string }[] } };
    for (const s of data.parse?.sections || []) {
      const line = s.line.replace(/<[^>]*>/g, '').trim().toLowerCase();
      if (!line || line.length > 60) continue;
      if (/^(see also|references|external links|notes|bibliography|further reading)$/.test(line)) continue;
      out.push({ keyword: `${seed} ${line}`, source: 'wikipedia', seed, intent: 'informational' });
    }
  }
  return out.slice(0, limit);
}

async function serper(p: RuntimeProvider, seed: string, limit: number): Promise<KeywordSuggestion[]> {
  const res = await fetchWithTimeout('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-API-KEY': p.apiKey },
    body: JSON.stringify({ q: seed, num: 20 }),
  }, 30_000);
  if (!res.ok) throw await httpError(res, 'serper');
  const data = (await res.json()) as {
    relatedSearches?: { query: string }[];
    peopleAlsoAsk?: { question: string }[];
  };
  const out: KeywordSuggestion[] = [];
  for (const r of data.relatedSearches || []) {
    out.push({ keyword: r.query.toLowerCase(), source: 'serper', seed, intent: guessIntent(r.query) });
  }
  for (const q of data.peopleAlsoAsk || []) {
    out.push({ keyword: q.question.toLowerCase(), source: 'serper-paa', seed, intent: 'informational' });
  }
  return out.slice(0, limit);
}

async function serpapi(p: RuntimeProvider, seed: string, limit: number): Promise<KeywordSuggestion[]> {
  const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(seed)}&api_key=${encodeURIComponent(p.apiKey)}`;
  const res = await fetchWithTimeout(url, {}, 30_000);
  if (!res.ok) throw await httpError(res, 'serpapi');
  const data = (await res.json()) as {
    related_searches?: { query: string }[];
    related_questions?: { question: string }[];
  };
  const out: KeywordSuggestion[] = [];
  for (const r of data.related_searches || []) {
    out.push({ keyword: r.query.toLowerCase(), source: 'serpapi', seed, intent: guessIntent(r.query) });
  }
  for (const q of data.related_questions || []) {
    out.push({ keyword: q.question.toLowerCase(), source: 'serpapi-paa', seed, intent: 'informational' });
  }
  return out.slice(0, limit);
}

/* -------------------------------------------------------------- helpers */

export function guessIntent(kw: string): string {
  const k = kw.toLowerCase();
  if (/^(how|what|why|when|where|which|who|can|is|does|are|do)\b/.test(k)) return 'informational';
  if (/\b(buy|price|cheap|deal|coupon|for sale|order|shop)\b/.test(k)) return 'transactional';
  if (/\b(best|top|vs|versus|review|compare|comparison|alternative)\b/.test(k)) return 'commercial';
  if (/\b(near me|login|contact|address|hours)\b/.test(k)) return 'navigational';
  return 'informational';
}

/**
 * Rough, free stand-in for a paid difficulty metric: long, question-shaped,
 * specific phrases are easier to rank for than short head terms.
 */
export function estimateDifficulty(kw: string): number {
  const words = kw.trim().split(/\s+/).length;
  let score = 70;
  score -= Math.min(35, (words - 1) * 7);
  if (/^(how|what|why|when|where|which|who)\b/.test(kw)) score -= 8;
  if (/\b(best|top|review|vs)\b/.test(kw)) score += 10;
  if (words <= 2) score += 12;
  return Math.max(1, Math.min(100, Math.round(score)));
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
