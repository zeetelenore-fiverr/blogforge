'use client';

import { useState } from 'react';
import { saveCampaignAction } from '@/app/admin/actions';
import { ActionForm, SubmitButton, Toggle, Collapse } from './ui';
import { DEFAULT_ARTICLE_PROMPT, PROMPT_VARIABLES } from '@/engine/prompts';

export type CampaignFormData = {
  id?: number;
  name: string;
  status: string;
  keywordSource: string;
  seedKeywords: string;
  promptTemplate: string;
  wordCount: number;
  tone: string;
  language: string;
  audience: string;
  pointOfView: string;
  categoryId: number | null;
  authorId: number | null;
  publishStatus: string;
  intervalMinutes: number;
  articlesPerRun: number;
  maxArticles: number;
  featuredImageEnabled: boolean;
  inlineImages: number;
  imageStyle: string;
  internalLinksEnabled: boolean;
  maxInternalLinks: number;
  externalLinksEnabled: boolean;
  faqEnabled: boolean;
  tocEnabled: boolean;
  keyTakeawaysEnabled: boolean;
  tableEnabled: boolean;
  schemaType: string;
  textProviderId: number | null;
  imageProviderId: number | null;
};

const INTERVALS = [
  { minutes: 60, label: 'Every hour' },
  { minutes: 180, label: 'Every 3 hours' },
  { minutes: 480, label: 'Every 8 hours' },
  { minutes: 720, label: 'Twice a day' },
  { minutes: 1440, label: 'Once a day' },
  { minutes: 2880, label: 'Every 2 days' },
  { minutes: 10080, label: 'Once a week' },
];

export function CampaignForm({
  campaign,
  categories,
  authors,
  textProviders,
  imageProviders,
}: {
  campaign?: CampaignFormData;
  categories: { id: number; name: string }[];
  authors: { id: number; name: string }[];
  textProviders: { id: number; label: string }[];
  imageProviders: { id: number; label: string }[];
}) {
  const c = campaign;
  const [interval, setInterval] = useState(c?.intervalMinutes ?? 1440);
  const [customPrompt, setCustomPrompt] = useState(!!c?.promptTemplate);
  const [source, setSource] = useState(c?.keywordSource ?? 'list');

  const perDay = 1440 / Math.max(1, interval);
  const rate = perDay >= 1
    ? `about ${round(perDay * (c?.articlesPerRun ?? 1))} article(s) a day`
    : `about ${round(perDay * 7 * (c?.articlesPerRun ?? 1))} article(s) a week`;

  return (
    <ActionForm action={saveCampaignAction} className="space-y-5">
      {c?.id && <input type="hidden" name="id" value={c.id} />}

      {/* ------------------------------------------------------- basics */}
      <div className="card space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="name">
              Campaign name <span className="text-red-500">*</span>
            </label>
            <input
              id="name"
              name="name"
              required
              defaultValue={c?.name || ''}
              placeholder="Espresso buying guides"
              className="field"
            />
          </div>
          <div>
            <label className="label" htmlFor="status">
              Status
            </label>
            <select id="status" name="status" className="field" defaultValue={c?.status || 'paused'}>
              <option value="paused">Paused</option>
              <option value="active">Active — generate on schedule</option>
              <option value="completed">Completed</option>
            </select>
          </div>
        </div>

        <div>
          <label className="label" htmlFor="keywordSource">
            Where topics come from
          </label>
          <select
            id="keywordSource"
            name="keywordSource"
            className="field"
            value={source}
            onChange={(e) => setSource(e.target.value)}
          >
            <option value="list">My keyword list below (in order)</option>
            <option value="research">Research automatically from the seeds below</option>
          </select>
          <p className="hint">
            {source === 'list'
              ? 'Each line becomes one article, top to bottom. When the list is exhausted the campaign researches more from the first seed.'
              : 'Seeds are expanded with Google Autocomplete plus AI, easiest keywords first.'}
          </p>
        </div>

        <div>
          <label className="label" htmlFor="seedKeywords">
            {source === 'list' ? 'Keywords, one per line' : 'Seed topics, one per line'}
          </label>
          <textarea
            id="seedKeywords"
            name="seedKeywords"
            rows={7}
            defaultValue={c?.seedKeywords || ''}
            placeholder={
              source === 'list'
                ? 'best espresso machine under 500\nhow to descale an espresso machine\nespresso vs drip coffee'
                : 'home espresso\ncoffee grinders'
            }
            className="field font-mono text-xs"
          />
        </div>
      </div>

      {/* ------------------------------------------------------ schedule */}
      <div className="card space-y-4 p-5">
        <h2 className="text-sm font-semibold text-slate-900">Schedule</h2>

        <div>
          <label className="label" htmlFor="intervalMinutes">
            Generate a new article
          </label>
          <div className="flex flex-wrap gap-2">
            {INTERVALS.map((i) => (
              <button
                key={i.minutes}
                type="button"
                onClick={() => setInterval(i.minutes)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                  interval === i.minutes
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {i.label}
              </button>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <input
              id="intervalMinutes"
              name="intervalMinutes"
              type="number"
              min={5}
              value={interval}
              onChange={(e) => setInterval(Number(e.target.value) || 1440)}
              className="field w-32"
            />
            <span className="text-sm text-slate-500">minutes between runs — {rate}</span>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="articlesPerRun">
              Articles per run
            </label>
            <input
              id="articlesPerRun"
              name="articlesPerRun"
              type="number"
              min={1}
              max={10}
              defaultValue={c?.articlesPerRun ?? 1}
              className="field"
            />
          </div>
          <div>
            <label className="label" htmlFor="maxArticles">
              Stop after
            </label>
            <input
              id="maxArticles"
              name="maxArticles"
              type="number"
              min={0}
              defaultValue={c?.maxArticles ?? 0}
              className="field"
            />
            <p className="hint">0 = never stop.</p>
          </div>
          <div>
            <label className="label" htmlFor="publishStatus">
              Publish as
            </label>
            <select
              id="publishStatus"
              name="publishStatus"
              className="field"
              defaultValue={c?.publishStatus || 'draft'}
            >
              <option value="draft">Draft — review first</option>
              <option value="published">Published immediately</option>
            </select>
          </div>
        </div>
      </div>

      {/* -------------------------------------------------------- article */}
      <div className="card space-y-4 p-5">
        <h2 className="text-sm font-semibold text-slate-900">Article shape</h2>

        <div className="grid gap-4 sm:grid-cols-4">
          <div>
            <label className="label" htmlFor="wordCount">
              Length (words)
            </label>
            <input
              id="wordCount"
              name="wordCount"
              type="number"
              min={300}
              max={6000}
              step={100}
              defaultValue={c?.wordCount ?? 1200}
              className="field"
            />
          </div>
          <div>
            <label className="label" htmlFor="tone">
              Tone
            </label>
            <input id="tone" name="tone" defaultValue={c?.tone || 'friendly expert'} className="field" />
          </div>
          <div>
            <label className="label" htmlFor="language">
              Language
            </label>
            <input id="language" name="language" defaultValue={c?.language || 'English'} className="field" />
          </div>
          <div>
            <label className="label" htmlFor="pointOfView">
              Point of view
            </label>
            <select
              id="pointOfView"
              name="pointOfView"
              className="field"
              defaultValue={c?.pointOfView || 'second person'}
            >
              <option value="second person">Second person (you)</option>
              <option value="first person plural">First person plural (we)</option>
              <option value="third person">Third person (neutral)</option>
            </select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="audience">
              Audience
            </label>
            <input
              id="audience"
              name="audience"
              defaultValue={c?.audience || 'general readers'}
              className="field"
            />
          </div>
          <div>
            <label className="label" htmlFor="categoryId">
              Category
            </label>
            <select id="categoryId" name="categoryId" className="field" defaultValue={c?.categoryId ?? ''}>
              <option value="">Uncategorised</option>
              {categories.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="authorId">
              Author
            </label>
            <select id="authorId" name="authorId" className="field" defaultValue={c?.authorId ?? ''}>
              <option value="">No author</option>
              {authors.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Toggle name="faqEnabled" defaultChecked={c?.faqEnabled ?? true} label="FAQ section" hint="Adds FAQ schema for rich results." />
          <Toggle name="keyTakeawaysEnabled" defaultChecked={c?.keyTakeawaysEnabled ?? true} label="Key takeaways box" hint="Summary at the top of the article." />
          <Toggle name="tocEnabled" defaultChecked={c?.tocEnabled ?? true} label="Table of contents" hint="Rendered automatically when there are 3+ sections." />
          <Toggle name="tableEnabled" defaultChecked={c?.tableEnabled ?? true} label="Ask for a comparison table" hint="Tables win featured snippets." />
          <Toggle name="externalLinksEnabled" defaultChecked={c?.externalLinksEnabled ?? true} label="Cite external sources" />
          <Toggle name="internalLinksEnabled" defaultChecked={c?.internalLinksEnabled ?? true} label="Automatic internal linking" hint="Links to and from your existing posts." />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="maxInternalLinks">
              Max internal links
            </label>
            <input
              id="maxInternalLinks"
              name="maxInternalLinks"
              type="number"
              min={0}
              max={20}
              defaultValue={c?.maxInternalLinks ?? 5}
              className="field"
            />
          </div>
          <div>
            <label className="label" htmlFor="inlineImages">
              In-article images
            </label>
            <input
              id="inlineImages"
              name="inlineImages"
              type="number"
              min={0}
              max={6}
              defaultValue={c?.inlineImages ?? 3}
              className="field"
            />
          </div>
          <div>
            <label className="label" htmlFor="schemaType">
              Schema type
            </label>
            <select id="schemaType" name="schemaType" className="field" defaultValue={c?.schemaType || 'BlogPosting'}>
              <option value="BlogPosting">BlogPosting</option>
              <option value="Article">Article</option>
              <option value="NewsArticle">NewsArticle</option>
              <option value="TechArticle">TechArticle</option>
            </select>
          </div>
        </div>

        <Toggle
          name="featuredImageEnabled"
          defaultChecked={c?.featuredImageEnabled ?? true}
          label="Generate a featured image"
          hint="With alt text written to match the article."
        />

        <div>
          <label className="label" htmlFor="imageStyle">
            Image style
          </label>
          <input
            id="imageStyle"
            name="imageStyle"
            defaultValue={c?.imageStyle || 'clean editorial photograph, natural light'}
            className="field"
          />
          <p className="hint">Appended to every image prompt so the blog looks visually consistent.</p>
        </div>
      </div>

      {/* --------------------------------------------------------- prompt */}
      <Collapse title="Writing prompt" badge={customPrompt ? 'custom' : 'default'}>
        <div className="space-y-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 accent-blue-600"
            />
            Use my own prompt instead of the built-in one
          </label>

          {customPrompt ? (
            <>
              <textarea
                name="promptTemplate"
                rows={22}
                defaultValue={c?.promptTemplate || DEFAULT_ARTICLE_PROMPT}
                className="field font-mono text-[12px] leading-relaxed"
              />
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs font-semibold text-slate-700">Available variables</p>
                <ul className="mt-1.5 grid gap-x-4 gap-y-1 text-[11px] text-slate-600 sm:grid-cols-2">
                  {PROMPT_VARIABLES.map((v) => (
                    <li key={v.token}>
                      <code className="rounded bg-white px-1 py-0.5 text-[10px]">{v.token}</code> {v.description}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[11px] text-slate-500">
                  Keep <code>{'{{imageCount}}'}</code> and the <code>[[IMAGE: brief | alt]]</code> instruction if you
                  want in-article images, and <code>{'{{internalLinks}}'}</code> for internal linking.
                </p>
              </div>
            </>
          ) : (
            <>
              <input type="hidden" name="promptTemplate" value="" />
              <p className="text-xs text-slate-500">
                The built-in prompt is tuned for Helpful Content: direct answer first, specifics over adjectives, no
                AI throat-clearing, a table, an FAQ and proper image briefs. Preview:
              </p>
              <pre className="max-h-60 overflow-auto rounded-lg bg-slate-900 p-3 text-[11px] leading-relaxed text-slate-300">
                {DEFAULT_ARTICLE_PROMPT}
              </pre>
            </>
          )}
        </div>
      </Collapse>

      {/* ------------------------------------------------------ providers */}
      {(textProviders.length > 1 || imageProviders.length > 1) && (
        <Collapse title="Pin specific providers">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="textProviderId">
                Text provider
              </label>
              <select
                id="textProviderId"
                name="textProviderId"
                className="field"
                defaultValue={c?.textProviderId ?? ''}
              >
                <option value="">Automatic (with failover)</option>
                {textProviders.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="imageProviderId">
                Image provider
              </label>
              <select
                id="imageProviderId"
                name="imageProviderId"
                className="field"
                defaultValue={c?.imageProviderId ?? ''}
              >
                <option value="">Automatic (with failover)</option>
                {imageProviders.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="hint mt-2">
            Pinning disables the fallback chain for that step — if the pinned provider is down, generation fails.
          </p>
        </Collapse>
      )}

      <div className="flex justify-end">
        <SubmitButton pendingLabel="Saving…">{c?.id ? 'Save campaign' : 'Create campaign'}</SubmitButton>
      </div>
    </ActionForm>
  );
}

const round = (n: number) => (n >= 10 ? Math.round(n) : Math.round(n * 10) / 10);
