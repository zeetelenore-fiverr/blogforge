/**
 * Catalog of the free/free-tier APIs BlogForge can drive.
 *
 * Nothing here calls anything — it is metadata that (a) renders the "Add
 * provider" screen, (b) tells the engine which adapter to use, and (c) records
 * where to get a key and what the free tier realistically allows. Free tiers
 * move around; `freeTier` is guidance for the operator, not an enforced limit.
 * The enforced limit is `dailyLimit` on the provider row.
 */

export type ProviderKind = 'text' | 'image' | 'keyword' | 'seo';

export type ExtraField = {
  key: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  help?: string;
};

export type CatalogEntry = {
  id: string;
  kind: ProviderKind;
  name: string;
  /** Adapter used at runtime. */
  adapter: string;
  keyRequired: boolean;
  /** True when the service costs nothing at all, no account needed. */
  noAccount?: boolean;
  freeTier: string;
  signupUrl: string;
  docsUrl?: string;
  models?: string[];
  defaultModel?: string;
  extraFields?: ExtraField[];
  notes?: string;
  recommended?: boolean;
};

export const CATALOG: CatalogEntry[] = [
  /* --------------------------------------------------------------- TEXT */
  {
    id: 'gemini',
    kind: 'text',
    name: 'Google Gemini',
    adapter: 'gemini',
    keyRequired: true,
    recommended: true,
    freeTier: 'Free tier in AI Studio — generous daily request allowance, no card required.',
    signupUrl: 'https://aistudio.google.com/app/apikey',
    docsUrl: 'https://ai.google.dev/gemini-api/docs',
    models: [
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite',
      'gemini-2.0-flash',
      'gemini-2.0-flash-lite',
      'gemini-1.5-flash',
    ],
    defaultModel: 'gemini-2.5-flash',
    notes: 'Best default for long-form articles. Long context, fast, reliable JSON.',
  },
  {
    id: 'groq',
    kind: 'text',
    name: 'Groq Cloud',
    adapter: 'openai',
    keyRequired: true,
    recommended: true,
    freeTier: 'Free developer tier with per-minute and per-day request limits.',
    signupUrl: 'https://console.groq.com/keys',
    docsUrl: 'https://console.groq.com/docs',
    models: [
      'llama-3.3-70b-versatile',
      'llama-3.1-8b-instant',
      'openai/gpt-oss-120b',
      'openai/gpt-oss-20b',
      'qwen/qwen3-32b',
    ],
    defaultModel: 'llama-3.3-70b-versatile',
    extraFields: [
      { key: 'baseUrl', label: 'Base URL', placeholder: 'https://api.groq.com/openai/v1' },
    ],
    notes: 'Extremely fast. Great as the failover behind Gemini.',
  },
  {
    id: 'openrouter',
    kind: 'text',
    name: 'OpenRouter (free models)',
    adapter: 'openai',
    keyRequired: true,
    recommended: true,
    freeTier: 'Models ending in “:free” cost nothing. Daily cap per account.',
    signupUrl: 'https://openrouter.ai/keys',
    docsUrl: 'https://openrouter.ai/docs',
    models: [
      'deepseek/deepseek-chat-v3-0324:free',
      'deepseek/deepseek-r1:free',
      'meta-llama/llama-3.3-70b-instruct:free',
      'google/gemma-3-27b-it:free',
      'qwen/qwen3-235b-a22b:free',
      'mistralai/mistral-small-3.2-24b-instruct:free',
    ],
    defaultModel: 'deepseek/deepseek-chat-v3-0324:free',
    extraFields: [
      { key: 'baseUrl', label: 'Base URL', placeholder: 'https://openrouter.ai/api/v1' },
    ],
    notes: 'One key, dozens of free models. Always keep the “:free” suffix.',
  },
  {
    id: 'cerebras',
    kind: 'text',
    name: 'Cerebras',
    adapter: 'openai',
    keyRequired: true,
    freeTier: 'Free tier with a daily token allowance.',
    signupUrl: 'https://cloud.cerebras.ai',
    models: ['llama-3.3-70b', 'llama3.1-8b', 'qwen-3-32b'],
    defaultModel: 'llama-3.3-70b',
    extraFields: [{ key: 'baseUrl', label: 'Base URL', placeholder: 'https://api.cerebras.ai/v1' }],
  },
  {
    id: 'mistral',
    kind: 'text',
    name: 'Mistral AI',
    adapter: 'openai',
    keyRequired: true,
    freeTier: 'Free "Experiment" plan after phone verification.',
    signupUrl: 'https://console.mistral.ai/api-keys',
    models: ['mistral-small-latest', 'open-mistral-nemo', 'mistral-large-latest'],
    defaultModel: 'mistral-small-latest',
    extraFields: [{ key: 'baseUrl', label: 'Base URL', placeholder: 'https://api.mistral.ai/v1' }],
  },
  {
    id: 'cloudflare',
    kind: 'text',
    name: 'Cloudflare Workers AI',
    adapter: 'cloudflare-text',
    keyRequired: true,
    freeTier: 'Free daily neuron allowance on every Cloudflare account.',
    signupUrl: 'https://dash.cloudflare.com/profile/api-tokens',
    docsUrl: 'https://developers.cloudflare.com/workers-ai/models/',
    models: [
      '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      '@cf/meta/llama-3.1-8b-instruct-fast',
      '@cf/qwen/qwen2.5-coder-32b-instruct',
      '@cf/mistralai/mistral-small-3.1-24b-instruct',
    ],
    defaultModel: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    extraFields: [
      {
        key: 'accountId',
        label: 'Cloudflare Account ID',
        required: true,
        help: 'Found in the URL of your Cloudflare dashboard.',
      },
    ],
  },
  {
    id: 'github-models',
    kind: 'text',
    name: 'GitHub Models',
    adapter: 'openai',
    keyRequired: true,
    freeTier: 'Free for any GitHub account using a personal access token.',
    signupUrl: 'https://github.com/settings/personal-access-tokens',
    docsUrl: 'https://docs.github.com/github-models',
    models: ['openai/gpt-4o-mini', 'openai/gpt-4.1-mini', 'meta/Llama-3.3-70B-Instruct'],
    defaultModel: 'openai/gpt-4o-mini',
    extraFields: [
      { key: 'baseUrl', label: 'Base URL', placeholder: 'https://models.github.ai/inference' },
    ],
    notes: 'Use a fine-grained PAT with the "Models" permission.',
  },
  {
    id: 'huggingface',
    kind: 'text',
    name: 'Hugging Face Inference',
    adapter: 'openai',
    keyRequired: true,
    freeTier: 'Monthly free inference credits on a free HF account.',
    signupUrl: 'https://huggingface.co/settings/tokens',
    models: ['meta-llama/Llama-3.3-70B-Instruct', 'Qwen/Qwen2.5-72B-Instruct'],
    defaultModel: 'meta-llama/Llama-3.3-70B-Instruct',
    extraFields: [
      { key: 'baseUrl', label: 'Base URL', placeholder: 'https://router.huggingface.co/v1' },
    ],
  },
  {
    id: 'together',
    kind: 'text',
    name: 'Together AI',
    adapter: 'openai',
    keyRequired: true,
    freeTier: 'Free endpoints for selected models.',
    signupUrl: 'https://api.together.xyz/settings/api-keys',
    models: ['meta-llama/Llama-3.3-70B-Instruct-Turbo-Free'],
    defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free',
    extraFields: [{ key: 'baseUrl', label: 'Base URL', placeholder: 'https://api.together.xyz/v1' }],
  },
  {
    id: 'cohere',
    kind: 'text',
    name: 'Cohere',
    adapter: 'cohere',
    keyRequired: true,
    freeTier: 'Free trial keys: rate limited, no expiry, non-commercial.',
    signupUrl: 'https://dashboard.cohere.com/api-keys',
    models: ['command-r-plus-08-2024', 'command-r-08-2024'],
    defaultModel: 'command-r-08-2024',
  },
  {
    id: 'ollama',
    kind: 'text',
    name: 'Ollama (self-hosted)',
    adapter: 'openai',
    keyRequired: false,
    noAccount: true,
    freeTier: 'Completely free — runs on your own machine, no quota at all.',
    signupUrl: 'https://ollama.com/download',
    models: ['llama3.1', 'qwen2.5', 'gemma3', 'mistral'],
    defaultModel: 'llama3.1',
    extraFields: [
      { key: 'baseUrl', label: 'Base URL', placeholder: 'http://localhost:11434/v1' },
    ],
    notes: 'Zero-cost fallback that never rate-limits. Slower on modest hardware.',
  },
  {
    id: 'openai-compatible',
    kind: 'text',
    name: 'Any OpenAI-compatible endpoint',
    adapter: 'openai',
    keyRequired: false,
    freeTier: 'Depends on the endpoint you point it at.',
    signupUrl: '',
    defaultModel: '',
    extraFields: [
      { key: 'baseUrl', label: 'Base URL', required: true, placeholder: 'https://…/v1' },
    ],
    notes: 'Escape hatch for anything not listed — LM Studio, vLLM, a proxy, a new free host.',
  },

  /* -------------------------------------------------------------- IMAGE */
  {
    id: 'pollinations',
    kind: 'image',
    name: 'Pollinations.ai',
    adapter: 'pollinations',
    keyRequired: false,
    noAccount: true,
    recommended: true,
    freeTier: 'Free and keyless. Rate limited by IP.',
    signupUrl: 'https://pollinations.ai',
    models: ['flux', 'turbo', 'kontext'],
    defaultModel: 'flux',
    notes: 'Works with zero setup — the default so a fresh install can generate images immediately.',
  },
  {
    id: 'cloudflare-image',
    kind: 'image',
    name: 'Cloudflare Workers AI (images)',
    adapter: 'cloudflare-image',
    keyRequired: true,
    recommended: true,
    freeTier: 'Free daily neuron allowance.',
    signupUrl: 'https://dash.cloudflare.com/profile/api-tokens',
    models: [
      '@cf/black-forest-labs/flux-1-schnell',
      '@cf/stabilityai/stable-diffusion-xl-base-1.0',
      '@cf/bytedance/stable-diffusion-xl-lightning',
    ],
    defaultModel: '@cf/black-forest-labs/flux-1-schnell',
    extraFields: [{ key: 'accountId', label: 'Cloudflare Account ID', required: true }],
  },
  {
    id: 'gemini-image',
    kind: 'image',
    name: 'Google Gemini (image)',
    adapter: 'gemini-image',
    keyRequired: true,
    freeTier: 'Free tier image generation in AI Studio.',
    signupUrl: 'https://aistudio.google.com/app/apikey',
    models: ['gemini-2.5-flash-image-preview', 'gemini-2.0-flash-preview-image-generation'],
    defaultModel: 'gemini-2.5-flash-image-preview',
  },
  {
    id: 'huggingface-image',
    kind: 'image',
    name: 'Hugging Face (image)',
    adapter: 'hf-image',
    keyRequired: true,
    freeTier: 'Monthly free inference credits.',
    signupUrl: 'https://huggingface.co/settings/tokens',
    models: [
      'black-forest-labs/FLUX.1-schnell',
      'stabilityai/stable-diffusion-3.5-large-turbo',
    ],
    defaultModel: 'black-forest-labs/FLUX.1-schnell',
  },
  {
    id: 'together-image',
    kind: 'image',
    name: 'Together AI (FLUX free)',
    adapter: 'together-image',
    keyRequired: true,
    freeTier: 'FLUX.1-schnell-Free endpoint, rate limited.',
    signupUrl: 'https://api.together.xyz/settings/api-keys',
    models: ['black-forest-labs/FLUX.1-schnell-Free'],
    defaultModel: 'black-forest-labs/FLUX.1-schnell-Free',
  },
  {
    id: 'unsplash',
    kind: 'image',
    name: 'Unsplash (stock photos)',
    adapter: 'unsplash',
    keyRequired: true,
    freeTier: 'Free demo app: 50 requests/hour. Production access on request.',
    signupUrl: 'https://unsplash.com/oauth/applications',
    notes: 'Real photography instead of generated art. Attribution is added automatically.',
  },
  {
    id: 'pexels',
    kind: 'image',
    name: 'Pexels (stock photos)',
    adapter: 'pexels',
    keyRequired: true,
    freeTier: 'Free: 200 requests/hour, 20k/month.',
    signupUrl: 'https://www.pexels.com/api/new/',
  },

  /* ------------------------------------------------------------ KEYWORD */
  {
    id: 'google-suggest',
    kind: 'keyword',
    name: 'Google Autocomplete',
    adapter: 'google-suggest',
    keyRequired: false,
    noAccount: true,
    recommended: true,
    freeTier: 'Free and keyless. The same suggestions the search box shows.',
    signupUrl: '',
    notes:
      'Expands a seed with A–Z, question words and prepositions — real queries people type.',
  },
  {
    id: 'datamuse',
    kind: 'keyword',
    name: 'Datamuse',
    adapter: 'datamuse',
    keyRequired: false,
    noAccount: true,
    freeTier: 'Free, keyless, 100k requests/day.',
    signupUrl: 'https://www.datamuse.com/api/',
    notes: 'Semantically related terms — good for LSI / entity coverage.',
  },
  {
    id: 'wikipedia',
    kind: 'keyword',
    name: 'Wikipedia / Wikidata',
    adapter: 'wikipedia',
    keyRequired: false,
    noAccount: true,
    freeTier: 'Free, keyless.',
    signupUrl: '',
    notes: 'Entity discovery — pulls the subtopics an authoritative page covers.',
  },
  {
    id: 'ai-keywords',
    kind: 'keyword',
    name: 'AI keyword research',
    adapter: 'ai-keywords',
    keyRequired: false,
    noAccount: true,
    recommended: true,
    freeTier: 'Uses whichever free text provider is configured.',
    signupUrl: '',
    notes:
      'Clusters, scores intent and estimates difficulty. Needs at least one text provider.',
  },
  {
    id: 'serper',
    kind: 'keyword',
    name: 'Serper.dev (SERP data)',
    adapter: 'serper',
    keyRequired: true,
    freeTier: '2,500 free credits on signup, no card.',
    signupUrl: 'https://serper.dev/api-key',
    notes: 'Real SERP results, People Also Ask and related searches.',
  },
  {
    id: 'serpapi',
    kind: 'keyword',
    name: 'SerpApi',
    adapter: 'serpapi',
    keyRequired: true,
    freeTier: '100 searches/month free.',
    signupUrl: 'https://serpapi.com/manage-api-key',
  },

  /* ---------------------------------------------------------------- SEO */
  {
    id: 'pagespeed',
    kind: 'seo',
    name: 'Google PageSpeed Insights',
    adapter: 'pagespeed',
    keyRequired: false,
    recommended: true,
    freeTier: 'Free. Keyless works but is heavily throttled — a free key raises the limit.',
    signupUrl: 'https://developers.google.com/speed/docs/insights/v5/get-started',
    notes: 'Core Web Vitals + Lighthouse SEO score for any published URL.',
  },
  {
    id: 'gsc',
    kind: 'seo',
    name: 'Google Search Console',
    adapter: 'gsc',
    keyRequired: true,
    recommended: true,
    freeTier: 'Free. Uses a Google Cloud service account with the Search Console API enabled.',
    signupUrl: 'https://console.cloud.google.com/apis/library/searchconsole.googleapis.com',
    extraFields: [
      { key: 'clientEmail', label: 'Service account email', required: true },
      { key: 'siteUrl', label: 'Property URL', placeholder: 'https://example.com/', required: true },
    ],
    notes:
      'Paste the private key in the API key box. Add the service account as a user on the property.',
  },
  {
    id: 'bing-webmaster',
    kind: 'seo',
    name: 'Bing Webmaster Tools',
    adapter: 'bing',
    keyRequired: true,
    freeTier: 'Free API key from Bing Webmaster Tools.',
    signupUrl: 'https://www.bing.com/webmasters/',
    notes: 'Also exposes IndexNow-style URL submission.',
  },
  {
    id: 'builtin-seo',
    kind: 'seo',
    name: 'Built-in on-page analyzer',
    adapter: 'builtin',
    keyRequired: false,
    noAccount: true,
    recommended: true,
    freeTier: 'Always available — runs locally, no network calls.',
    signupUrl: '',
    notes: '30+ on-page checks: titles, meta, headings, keyword placement, links, images, schema.',
  },
];

export const byId = (id: string) => CATALOG.find((c) => c.id === id);
export const byKind = (kind: ProviderKind) => CATALOG.filter((c) => c.kind === kind);
