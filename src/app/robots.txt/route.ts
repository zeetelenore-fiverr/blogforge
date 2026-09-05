import { getSettings, isOn } from '@/lib/settings';

export const dynamic = 'force-dynamic';

export async function GET() {
  const s = await getSettings();
  const base = (s['site.url'] || 'http://localhost:3000').replace(/\/+$/, '');

  if (isOn(s['seo.noindexSite'])) {
    return text(['User-agent: *', 'Disallow: /', '', '# Search engines are discouraged in Settings → SEO.'].join('\n'));
  }

  const lines = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    'Disallow: /api/',
    'Disallow: /search',
    'Disallow: /*?page=',
    '',
    '# AI crawlers — remove any line below to opt that crawler out',
    'User-agent: GPTBot',
    'Allow: /',
    '',
    'User-agent: ClaudeBot',
    'Allow: /',
    '',
    'User-agent: PerplexityBot',
    'Allow: /',
    '',
    'User-agent: Google-Extended',
    'Allow: /',
    '',
    `Sitemap: ${base}/sitemap.xml`,
    ...(isOn(s['llms.enabled']) ? [`# LLM index: ${base}/llms.txt`] : []),
  ];

  if (s['robots.custom'].trim()) lines.push('', '# --- custom rules ---', s['robots.custom'].trim());

  return text(lines.join('\n'));
}

const text = (body: string) =>
  new Response(body, {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=0, s-maxage=3600' },
  });
