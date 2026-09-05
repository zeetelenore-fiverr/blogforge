export function slugify(input: string, max = 70): string {
  const base = input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining accents
    .toLowerCase()
    .replace(/['’"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (base.length <= max) return base || 'post';
  // Trim on a word boundary so slugs never end mid-word.
  return base.slice(0, max).replace(/-[^-]*$/, '') || base.slice(0, max);
}

export function wordCount(text: string): number {
  return (text.trim().match(/\S+/g) || []).length;
}

export const readingTime = (words: number) => Math.max(1, Math.round(words / 225));

export function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/[*_`>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function truncate(text: string, len: number): string {
  const clean = text.trim().replace(/\s+/g, ' ');
  if (clean.length <= len) return clean;
  return `${clean.slice(0, len - 1).replace(/[\s,;:.-]+\S*$/, '')}…`;
}

/** Escape for embedding inside HTML text/attributes. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Models love to wrap JSON in prose or fences. Pull the first balanced object
 * or array out of the response and parse that.
 */
export function extractJson<T = unknown>(raw: string): T | null {
  if (!raw) return null;
  const text = raw.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  const direct = tryParse<T>(text);
  if (direct !== null) return direct;

  for (const open of ['{', '[']) {
    const close = open === '{' ? '}' : ']';
    const start = text.indexOf(open);
    if (start === -1) continue;
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = start; i < text.length; i++) {
      const c = text[i];
      if (esc) { esc = false; continue; }
      if (c === '\\') { esc = true; continue; }
      if (c === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (c === open) depth++;
      else if (c === close) {
        depth--;
        if (depth === 0) {
          const parsed = tryParse<T>(text.slice(start, i + 1));
          if (parsed !== null) return parsed;
          break;
        }
      }
    }
  }
  return null;
}

function tryParse<T>(s: string): T | null {
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** fetch with a hard timeout — free endpoints hang more often than they 500. */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 60_000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: 'no-store' });
  } finally {
    clearTimeout(timer);
  }
}

export function formatDate(d: Date | number | null | undefined, locale = 'en-US'): string {
  if (!d) return '';
  return new Date(d).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function timeAgo(d: Date | number | null | undefined): string {
  if (!d) return 'never';
  const secs = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  const abs = Math.abs(secs);
  const units: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, 'second'], [3600, 'minute'], [86400, 'hour'],
    [604800, 'day'], [2629800, 'week'], [31557600, 'month'],
  ];
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  let prev = 1;
  for (const [limit, unit] of units) {
    if (abs < limit) return rtf.format(-Math.round(secs / prev), unit);
    prev = limit;
  }
  return rtf.format(-Math.round(secs / 31557600), 'year');
}

export const json = <T>(s: string, fallback: T): T => {
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
};
