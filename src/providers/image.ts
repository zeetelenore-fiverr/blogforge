import 'server-only';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fetchWithTimeout } from '@/lib/util';
import { ProviderError, httpError } from './text';
import type { RuntimeProvider, ImageResult } from './types';

export type ImageRequest = {
  prompt: string;
  width?: number;
  height?: number;
  /** Used for the saved filename and as a search query for stock providers. */
  slug?: string;
};

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads');

export async function callImage(p: RuntimeProvider, req: ImageRequest): Promise<ImageResult> {
  switch (p.adapter) {
    case 'pollinations':
      return pollinations(p, req);
    case 'cloudflare-image':
      return cloudflareImage(p, req);
    case 'gemini-image':
      return geminiImage(p, req);
    case 'hf-image':
      return hfImage(p, req);
    case 'together-image':
      return togetherImage(p, req);
    case 'unsplash':
      return unsplash(p, req);
    case 'pexels':
      return pexels(p, req);
    default:
      throw new ProviderError(`Unknown image adapter: ${p.adapter}`);
  }
}

/* ------------------------------------------------------------- adapters */

/**
 * Keyless. The URL itself is the generator, so we fetch it once and store the
 * bytes locally — otherwise every page view would re-generate the image.
 */
async function pollinations(p: RuntimeProvider, req: ImageRequest): Promise<ImageResult> {
  const w = req.width ?? 1200;
  const h = req.height ?? 675;
  const seed = Math.floor(Math.random() * 1_000_000);
  const url =
    `https://image.pollinations.ai/prompt/${encodeURIComponent(req.prompt)}` +
    `?width=${w}&height=${h}&model=${encodeURIComponent(p.model || 'flux')}` +
    `&nologo=true&enhance=true&seed=${seed}`;

  const res = await fetchWithTimeout(url, {}, 180_000);
  if (!res.ok) throw await httpError(res, 'pollinations');
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1024) throw new ProviderError('Pollinations returned an empty image');

  // On a read-only serverless filesystem we cannot keep a local copy. The
  // Pollinations URL is deterministic for a given prompt+seed, so hotlinking it
  // is a working fallback rather than losing the image entirely.
  const stored = await trySave(buf, req.slug, 'jpg');
  return { url: stored ?? url, provider: 'pollinations', width: w, height: h };
}

async function cloudflareImage(p: RuntimeProvider, req: ImageRequest): Promise<ImageResult> {
  const account = p.extra.accountId;
  if (!account) throw new ProviderError('Cloudflare account ID is missing');
  const model = p.model || '@cf/black-forest-labs/flux-1-schnell';
  const res = await fetchWithTimeout(
    `https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${model}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${p.apiKey}` },
      body: JSON.stringify({
        prompt: req.prompt,
        ...(model.includes('flux') ? { steps: 6 } : { width: req.width ?? 1024, height: req.height ?? 576 }),
      }),
    },
    180_000,
  );
  if (!res.ok) throw await httpError(res, 'cloudflare-image');

  const type = res.headers.get('content-type') || '';
  if (type.includes('application/json')) {
    // FLUX returns { result: { image: "<base64>" } }
    const data = (await res.json()) as { result?: { image?: string }; errors?: { message: string }[] };
    if (data.errors?.length) throw new ProviderError(data.errors.map((e) => e.message).join('; '));
    const b64 = data.result?.image;
    if (!b64) throw new ProviderError('Workers AI returned no image');
    return { url: await save(Buffer.from(b64, 'base64'), req.slug, 'jpg'), provider: 'cloudflare' };
  }
  const buf = Buffer.from(await res.arrayBuffer());
  return { url: await save(buf, req.slug, 'png'), provider: 'cloudflare' };
}

async function geminiImage(p: RuntimeProvider, req: ImageRequest): Promise<ImageResult> {
  const model = p.model || 'gemini-2.5-flash-image-preview';
  const res = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': p.apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: req.prompt }] }],
        generationConfig: { responseModalities: ['IMAGE'] },
      }),
    },
    180_000,
  );
  if (!res.ok) throw await httpError(res, 'gemini-image');
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] } }[];
  };
  const part = data.candidates?.[0]?.content?.parts?.find((x) => x.inlineData?.data);
  if (!part?.inlineData?.data) throw new ProviderError('Gemini returned no image data');
  const ext = (part.inlineData.mimeType || 'image/png').split('/')[1] || 'png';
  return {
    url: await save(Buffer.from(part.inlineData.data, 'base64'), req.slug, ext),
    provider: 'gemini',
  };
}

async function hfImage(p: RuntimeProvider, req: ImageRequest): Promise<ImageResult> {
  const model = p.model || 'black-forest-labs/FLUX.1-schnell';
  const res = await fetchWithTimeout(
    `https://api-inference.huggingface.co/models/${model}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${p.apiKey}` },
      body: JSON.stringify({ inputs: req.prompt }),
    },
    180_000,
  );
  if (!res.ok) throw await httpError(res, 'huggingface-image');
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1024) throw new ProviderError('Hugging Face returned an empty image');
  return { url: await save(buf, req.slug, 'jpg'), provider: 'huggingface' };
}

async function togetherImage(p: RuntimeProvider, req: ImageRequest): Promise<ImageResult> {
  const res = await fetchWithTimeout(
    'https://api.together.xyz/v1/images/generations',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${p.apiKey}` },
      body: JSON.stringify({
        model: p.model || 'black-forest-labs/FLUX.1-schnell-Free',
        prompt: req.prompt,
        width: req.width ?? 1024,
        height: req.height ?? 576,
        steps: 4,
        n: 1,
        response_format: 'b64_json',
      }),
    },
    180_000,
  );
  if (!res.ok) throw await httpError(res, 'together-image');
  const data = (await res.json()) as { data?: { b64_json?: string; url?: string }[] };
  const first = data.data?.[0];
  if (first?.b64_json) {
    return { url: await save(Buffer.from(first.b64_json, 'base64'), req.slug, 'jpg'), provider: 'together' };
  }
  if (first?.url) return { url: await mirror(first.url, req.slug), provider: 'together' };
  throw new ProviderError('Together returned no image');
}

async function unsplash(p: RuntimeProvider, req: ImageRequest): Promise<ImageResult> {
  const q = req.slug?.replace(/-/g, ' ') || req.prompt.slice(0, 80);
  const res = await fetchWithTimeout(
    `https://api.unsplash.com/search/photos?per_page=1&orientation=landscape&query=${encodeURIComponent(q)}`,
    { headers: { authorization: `Client-ID ${p.apiKey}` } },
    30_000,
  );
  if (!res.ok) throw await httpError(res, 'unsplash');
  const data = (await res.json()) as {
    results?: { urls?: { regular?: string }; user?: { name?: string; links?: { html?: string } } }[];
  };
  const hit = data.results?.[0];
  if (!hit?.urls?.regular) throw new ProviderError(`No Unsplash photo for "${q}"`);
  return {
    url: hit.urls.regular,
    provider: 'unsplash',
    attribution: hit.user?.name ? `Photo by ${hit.user.name} on Unsplash` : undefined,
  };
}

async function pexels(p: RuntimeProvider, req: ImageRequest): Promise<ImageResult> {
  const q = req.slug?.replace(/-/g, ' ') || req.prompt.slice(0, 80);
  const res = await fetchWithTimeout(
    `https://api.pexels.com/v1/search?per_page=1&orientation=landscape&query=${encodeURIComponent(q)}`,
    { headers: { authorization: p.apiKey } },
    30_000,
  );
  if (!res.ok) throw await httpError(res, 'pexels');
  const data = (await res.json()) as {
    photos?: { src?: { large2x?: string; large?: string }; photographer?: string }[];
  };
  const hit = data.photos?.[0];
  const url = hit?.src?.large2x || hit?.src?.large;
  if (!url) throw new ProviderError(`No Pexels photo for "${q}"`);
  return {
    url,
    provider: 'pexels',
    attribution: hit?.photographer ? `Photo by ${hit.photographer} on Pexels` : undefined,
  };
}

/* -------------------------------------------------------------- storage */

async function save(buf: Buffer, slug: string | undefined, ext: string): Promise<string> {
  try {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    const stamp = crypto.randomBytes(4).toString('hex');
    const name = `${(slug || 'image').slice(0, 60)}-${stamp}.${ext}`;
    await fs.writeFile(path.join(UPLOAD_DIR, name), buf);
    return `/uploads/${name}`;
  } catch (err) {
    throw new ProviderError(
      `Could not write to public/uploads (${(err as Error).message}). ` +
        'Serverless hosts have a read-only filesystem — use a stock-photo provider ' +
        '(Unsplash or Pexels return hosted URLs) or deploy somewhere with a writable disk.',
    );
  }
}

/** save() but returns null instead of throwing, for providers that can fall back. */
async function trySave(buf: Buffer, slug: string | undefined, ext: string): Promise<string | null> {
  try {
    return await save(buf, slug, ext);
  } catch {
    return null;
  }
}

async function mirror(url: string, slug?: string): Promise<string> {
  const res = await fetchWithTimeout(url, {}, 60_000);
  if (!res.ok) throw await httpError(res, 'image mirror');
  return save(Buffer.from(await res.arrayBuffer()), slug, 'jpg');
}
