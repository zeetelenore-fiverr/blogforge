import Link from 'next/link';
import { asc, eq } from 'drizzle-orm';
import { db, categories, campaigns, providers } from '@/db';
import { requireUser } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { PageHeader } from '@/components/admin/bits';
import { ActionForm, SubmitButton, Toggle } from '@/components/admin/ui';
import { generateNowAction } from '../../actions';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ keyword?: string; campaign?: string }> };

export default async function NewPostPage({ searchParams }: Props) {
  await requireUser();
  const sp = await searchParams;
  const s = await getSettings();

  const [cats, camps, textProviders] = await Promise.all([
    db.select().from(categories).orderBy(asc(categories.name)),
    db.select().from(campaigns).orderBy(asc(campaigns.name)),
    db.select().from(providers).where(eq(providers.kind, 'text')),
  ]);

  const ready = textProviders.some((p) => p.enabled);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Generate an article"
        description="One-off generation. For anything recurring, use a campaign instead."
      >
        <Link href="/admin/posts" className="btn btn-ghost">
          Back to posts
        </Link>
      </PageHeader>

      {!ready && (
        <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          No text provider is enabled yet.{' '}
          <Link href="/admin/providers" className="font-semibold underline">
            Add a free key
          </Link>{' '}
          — Google Gemini takes about two minutes and needs no card.
        </div>
      )}

      <ActionForm action={generateNowAction} className="card space-y-5 p-6">
        <div>
          <label className="label" htmlFor="keyword">
            Focus keyword or topic <span className="text-red-500">*</span>
          </label>
          <input
            id="keyword"
            name="keyword"
            required
            defaultValue={sp.keyword || ''}
            placeholder="best espresso machine under 500"
            className="field"
            autoFocus
          />
          <p className="hint">
            Everything else is derived from this — title, outline, metadata, images and internal links.
          </p>
        </div>

        <div>
          <label className="label" htmlFor="title">
            Title override
          </label>
          <input id="title" name="title" className="field" placeholder="Leave blank to let the model choose" />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
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
              defaultValue={s['gen.defaultWordCount']}
              className="field"
            />
          </div>
          <div>
            <label className="label" htmlFor="categoryId">
              Category
            </label>
            <select id="categoryId" name="categoryId" className="field">
              <option value="">Uncategorised</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
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
              defaultValue={3}
              className="field"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="tone">
              Tone
            </label>
            <input id="tone" name="tone" className="field" defaultValue="friendly expert" list="tones" />
            <datalist id="tones">
              <option value="friendly expert" />
              <option value="plain and practical" />
              <option value="authoritative and formal" />
              <option value="conversational" />
              <option value="enthusiastic" />
            </datalist>
          </div>
          <div>
            <label className="label" htmlFor="audience">
              Audience
            </label>
            <input id="audience" name="audience" className="field" defaultValue="general readers" />
          </div>
          <div>
            <label className="label" htmlFor="language">
              Language
            </label>
            <input id="language" name="language" className="field" defaultValue="English" />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="publishStatus">
              When finished
            </label>
            <select id="publishStatus" name="publishStatus" className="field" defaultValue="draft">
              <option value="draft">Save as draft (review first)</option>
              <option value="published">Publish immediately</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="scheduledFor">
              Or schedule for
            </label>
            <input id="scheduledFor" name="scheduledFor" type="datetime-local" className="field" />
            <p className="hint">Overrides the option on the left.</p>
          </div>
        </div>

        {camps.length > 0 && (
          <div>
            <label className="label" htmlFor="campaignId">
              Use a campaign&rsquo;s settings
            </label>
            <select id="campaignId" name="campaignId" className="field" defaultValue={sp.campaign || ''}>
              <option value="">None — use the options above</option>
              {camps.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <p className="hint">Inherits its prompt, tone, image settings and linking rules.</p>
          </div>
        )}

        <Toggle
          name="background"
          label="Generate in the background"
          hint="Queues it as a job instead of waiting. Recommended — a full article takes 30–90 seconds and slow free tiers can take longer."
          defaultChecked
        />

        <SubmitButton disabled={!ready} pendingLabel="Generating… this can take a minute">
          Generate article
        </SubmitButton>
      </ActionForm>
    </div>
  );
}
