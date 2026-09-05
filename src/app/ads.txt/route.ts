import { getSettings, isOn } from '@/lib/settings';

export const dynamic = 'force-dynamic';

/**
 * ads.txt — AdSense will not serve on a domain whose ads.txt is missing or
 * wrong. If the operator pasted their own file we serve that verbatim;
 * otherwise we derive the single required Google line from the publisher ID.
 */
export async function GET() {
  const s = await getSettings();
  const custom = s['adsense.adsTxt'].trim();

  if (custom) return text(custom);

  const client = s['adsense.client'].trim();
  if (!isOn(s['adsense.enabled']) || !client) {
    return new Response('Not found', { status: 404 });
  }

  const pub = client.replace(/^ca-/, '');
  return text(`google.com, ${pub}, DIRECT, f08c47fec0942fa0`);
}

const text = (body: string) =>
  new Response(`${body}\n`, {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=0, s-maxage=3600' },
  });
