import 'server-only';
import { fetchWithTimeout } from '@/lib/util';
import type { RuntimeProvider } from './types';

export type TextRequest = {
  system?: string;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
  /** Ask the provider for strict JSON where it supports it. */
  json?: boolean;
};

const DEFAULT_BASE_URLS: Record<string, string> = {
  groq: 'https://api.groq.com/openai/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  cerebras: 'https://api.cerebras.ai/v1',
  mistral: 'https://api.mistral.ai/v1',
  'github-models': 'https://models.github.ai/inference',
  huggingface: 'https://router.huggingface.co/v1',
  together: 'https://api.together.xyz/v1',
  ollama: 'http://localhost:11434/v1',
};

export class ProviderError extends Error {
  constructor(message: string, readonly rateLimited = false, readonly status = 0) {
    super(message);
    this.name = 'ProviderError';
  }
}

/** Dispatch to the right adapter. Returns raw model text. */
export async function callText(p: RuntimeProvider, req: TextRequest): Promise<string> {
  switch (p.adapter) {
    case 'gemini':
      return gemini(p, req);
    case 'cloudflare-text':
      return cloudflareText(p, req);
    case 'cohere':
      return cohere(p, req);
    case 'openai':
    default:
      return openaiCompatible(p, req);
  }
}

/* ------------------------------------------------------------- adapters */

async function openaiCompatible(p: RuntimeProvider, req: TextRequest): Promise<string> {
  const base = (p.extra.baseUrl || DEFAULT_BASE_URLS[p.providerId] || '').replace(/\/+$/, '');
  if (!base) throw new ProviderError(`No base URL configured for ${p.providerId}`);

  const messages = [
    ...(req.system ? [{ role: 'system', content: req.system }] : []),
    { role: 'user', content: req.prompt },
  ];

  const body: Record<string, unknown> = {
    model: p.model,
    messages,
    temperature: req.temperature ?? 0.7,
    max_tokens: req.maxTokens ?? 4096,
  };
  // Not every free host implements response_format; only Groq/OpenRouter/
  // Mistral/GitHub reliably do, and a bad field is a hard 400 elsewhere.
  if (req.json && ['groq', 'openrouter', 'mistral', 'github-models'].includes(p.providerId)) {
    body.response_format = { type: 'json_object' };
  }

  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (p.apiKey) headers.authorization = `Bearer ${p.apiKey}`;
  if (p.providerId === 'openrouter') {
    headers['HTTP-Referer'] = p.extra.referer || 'https://github.com/blogforge';
    headers['X-Title'] = 'BlogForge';
  }

  const res = await fetchWithTimeout(`${base}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  }, 120_000);

  if (!res.ok) throw await httpError(res, p.providerId);

  const data = (await res.json()) as {
    choices?: { message?: { content?: string | { text?: string }[] } }[];
    error?: { message?: string };
  };
  if (data.error?.message) throw new ProviderError(data.error.message);

  const content = data.choices?.[0]?.message?.content;
  const text = Array.isArray(content)
    ? content.map((c) => c.text || '').join('')
    : (content ?? '');
  if (!text.trim()) throw new ProviderError('Empty response from model');
  return text;
}

async function gemini(p: RuntimeProvider, req: TextRequest): Promise<string> {
  const base = p.extra.baseUrl || 'https://generativelanguage.googleapis.com/v1beta';
  const url = `${base.replace(/\/+$/, '')}/models/${p.model}:generateContent`;

  const body: Record<string, unknown> = {
    contents: [{ role: 'user', parts: [{ text: req.prompt }] }],
    generationConfig: {
      temperature: req.temperature ?? 0.7,
      maxOutputTokens: req.maxTokens ?? 8192,
      ...(req.json ? { responseMimeType: 'application/json' } : {}),
    },
    // Blogging topics trip the default filters more often than you'd expect.
    safetySettings: [
      'HARM_CATEGORY_HARASSMENT',
      'HARM_CATEGORY_HATE_SPEECH',
      'HARM_CATEGORY_SEXUALLY_EXPLICIT',
      'HARM_CATEGORY_DANGEROUS_CONTENT',
    ].map((category) => ({ category, threshold: 'BLOCK_ONLY_HIGH' })),
  };
  if (req.system) body.systemInstruction = { parts: [{ text: req.system }] };

  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': p.apiKey },
    body: JSON.stringify(body),
  }, 120_000);

  if (!res.ok) throw await httpError(res, 'gemini');

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    promptFeedback?: { blockReason?: string };
    error?: { message?: string };
  };
  if (data.error?.message) throw new ProviderError(data.error.message);
  if (data.promptFeedback?.blockReason) {
    throw new ProviderError(`Blocked by safety filter: ${data.promptFeedback.blockReason}`);
  }
  const text = (data.candidates?.[0]?.content?.parts || []).map((x) => x.text || '').join('');
  if (!text.trim()) {
    throw new ProviderError(`Empty response (finish: ${data.candidates?.[0]?.finishReason ?? '?'})`);
  }
  return text;
}

async function cloudflareText(p: RuntimeProvider, req: TextRequest): Promise<string> {
  const account = p.extra.accountId;
  if (!account) throw new ProviderError('Cloudflare account ID is missing');
  const url = `https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${p.model}`;

  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${p.apiKey}` },
    body: JSON.stringify({
      messages: [
        ...(req.system ? [{ role: 'system', content: req.system }] : []),
        { role: 'user', content: req.prompt },
      ],
      max_tokens: req.maxTokens ?? 4096,
      temperature: req.temperature ?? 0.7,
    }),
  }, 120_000);

  if (!res.ok) throw await httpError(res, 'cloudflare');

  const data = (await res.json()) as {
    result?: { response?: string };
    errors?: { message: string }[];
  };
  if (data.errors?.length) throw new ProviderError(data.errors.map((e) => e.message).join('; '));
  const text = data.result?.response ?? '';
  if (!text.trim()) throw new ProviderError('Empty response from Workers AI');
  return text;
}

async function cohere(p: RuntimeProvider, req: TextRequest): Promise<string> {
  const res = await fetchWithTimeout('https://api.cohere.com/v2/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${p.apiKey}` },
    body: JSON.stringify({
      model: p.model,
      messages: [
        ...(req.system ? [{ role: 'system', content: req.system }] : []),
        { role: 'user', content: req.prompt },
      ],
      temperature: req.temperature ?? 0.7,
      max_tokens: req.maxTokens ?? 4096,
    }),
  }, 120_000);

  if (!res.ok) throw await httpError(res, 'cohere');
  const data = (await res.json()) as { message?: { content?: { text?: string }[] } };
  const text = (data.message?.content || []).map((c) => c.text || '').join('');
  if (!text.trim()) throw new ProviderError('Empty response from Cohere');
  return text;
}

/* -------------------------------------------------------------- helpers */

export async function httpError(res: Response, who: string): Promise<ProviderError> {
  let detail = '';
  try {
    detail = (await res.text()).slice(0, 400);
  } catch {
    /* body already consumed or unreadable */
  }
  // Some free gateways wrap an upstream 429 in their own 500, so the status
  // code alone is not enough to tell a rate limit from a real fault.
  const rateLimited =
    res.status === 429 ||
    res.status === 402 ||
    res.status === 503 ||
    /\b429\b|rate.?limit|too many requests|quota/i.test(detail);
  return new ProviderError(`${who} ${res.status}: ${detail || res.statusText}`, rateLimited, res.status);
}
