import { indexNowKey } from '@/engine/indexing';

export const dynamic = 'force-dynamic';

/**
 * IndexNow key verification file. The spec allows the key to live anywhere on
 * the host as long as the submission passes a matching `keyLocation`, which is
 * what we do — the root of the site is reserved for static pages.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const expected = await indexNowKey();
  const asked = key.replace(/\.txt$/i, '');

  if (asked !== expected) return new Response('Not found', { status: 404 });

  return new Response(expected, {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' },
  });
}
