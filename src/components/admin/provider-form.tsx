'use client';

import { useState } from 'react';
import type { CatalogEntry, ProviderKind } from '@/providers/catalog';
import { saveProviderAction } from '@/app/admin/actions';
import { ActionForm, SubmitButton, Toggle } from './ui';

export type ExistingProvider = {
  id: number;
  kind: ProviderKind;
  providerId: string;
  label: string;
  model: string | null;
  priority: number;
  dailyLimit: number;
  enabled: boolean;
  extra: Record<string, string>;
  hasKey: boolean;
};

const KIND_COPY: Record<ProviderKind, { title: string; blurb: string }> = {
  text: {
    title: 'Text generation',
    blurb: 'Writes the articles. Add two or three — when a free tier rate-limits, BlogForge falls through to the next one automatically.',
  },
  image: {
    title: 'Image generation',
    blurb: 'Featured and in-article images. Pollinations works with no key at all, so this is already covered.',
  },
  keyword: {
    title: 'Keyword research',
    blurb: 'Where article topics come from. Google Autocomplete and Datamuse are keyless; the AI source uses your text provider.',
  },
  seo: {
    title: 'SEO & indexing',
    blurb: 'Page scoring, Core Web Vitals and Search Console coverage data.',
  },
};

export function ProviderForm({
  catalog,
  existing,
  onCancel,
}: {
  catalog: CatalogEntry[];
  existing?: ExistingProvider;
  onCancel?: () => void;
}) {
  const [selectedId, setSelectedId] = useState(existing?.providerId || catalog[0]?.id || '');
  const entry = catalog.find((c) => c.id === selectedId) || catalog[0];
  if (!entry) return null;

  return (
    <ActionForm action={saveProviderAction} className="space-y-4">
      {existing && <input type="hidden" name="id" value={existing.id} />}

      <div>
        <label className="label" htmlFor={`provider-${existing?.id ?? 'new'}`}>
          Service
        </label>
        <select
          id={`provider-${existing?.id ?? 'new'}`}
          name="providerId"
          className="field"
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          disabled={!!existing}
        >
          {catalog.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.recommended ? ' — recommended' : ''}
              {c.noAccount ? ' (no signup)' : ''}
            </option>
          ))}
        </select>
        {existing && <input type="hidden" name="providerId" value={existing.providerId} />}
        <p className="hint">{entry.freeTier}</p>
      </div>

      {entry.notes && (
        <p className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-900">{entry.notes}</p>
      )}

      {entry.keyRequired || !entry.noAccount ? (
        <div>
          <label className="label" htmlFor={`key-${existing?.id ?? 'new'}`}>
            API key {entry.keyRequired ? '' : '(optional)'}
          </label>
          <input
            id={`key-${existing?.id ?? 'new'}`}
            name="apiKey"
            type="password"
            autoComplete="off"
            spellCheck={false}
            className="field font-mono text-xs"
            placeholder={existing?.hasKey ? '•••••••••• (leave blank to keep the stored key)' : 'Paste your key'}
          />
          <p className="hint">
            Stored encrypted with AES-256-GCM using your APP_SECRET; it is never sent to the browser again.
            {entry.signupUrl && (
              <>
                {' '}
                <a
                  href={entry.signupUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-blue-600 hover:underline"
                >
                  Get a free key ↗
                </a>
              </>
            )}
          </p>
        </div>
      ) : (
        <p className="rounded-lg bg-green-50 px-3 py-2 text-xs text-green-900">
          No key needed — this service is free and open.
        </p>
      )}

      {(entry.extraFields || []).map((f) => (
        <div key={f.key}>
          <label className="label" htmlFor={`x-${entry.id}-${f.key}`}>
            {f.label} {f.required && <span className="text-red-500">*</span>}
          </label>
          <input
            id={`x-${entry.id}-${f.key}`}
            name={`extra.${f.key}`}
            className="field"
            placeholder={f.placeholder}
            defaultValue={existing?.extra?.[f.key] || ''}
          />
          {f.help && <p className="hint">{f.help}</p>}
        </div>
      ))}

      <div>
        <label className="label" htmlFor={`model-${existing?.id ?? 'new'}`}>
          Model
        </label>
        {/* Keyed on the service so switching it resets the prefilled default. */}
        <input
          key={`model-${entry.id}`}
          id={`model-${existing?.id ?? 'new'}`}
          name="model"
          className="field font-mono text-xs"
          list={`models-${entry.id}`}
          defaultValue={existing?.model || entry.defaultModel || ''}
          placeholder={entry.models?.length ? entry.models[0] : 'model name this endpoint expects'}
        />
        {entry.models && entry.models.length > 0 && (
          <datalist id={`models-${entry.id}`}>
            {entry.models.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        )}
        <p className="hint">Pick from the list or type any model this endpoint supports.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor={`label-${existing?.id ?? 'new'}`}>
            Display name
          </label>
          <input
            key={`label-${entry.id}`}
            id={`label-${existing?.id ?? 'new'}`}
            name="label"
            className="field"
            defaultValue={existing?.label || entry.name}
          />
        </div>
        <div>
          <label className="label" htmlFor={`priority-${existing?.id ?? 'new'}`}>
            Priority
          </label>
          <input
            id={`priority-${existing?.id ?? 'new'}`}
            name="priority"
            type="number"
            min={1}
            max={999}
            className="field"
            defaultValue={existing?.priority ?? 100}
          />
          <p className="hint">Lower runs first.</p>
        </div>
        <div>
          <label className="label" htmlFor={`limit-${existing?.id ?? 'new'}`}>
            Daily call cap
          </label>
          <input
            id={`limit-${existing?.id ?? 'new'}`}
            name="dailyLimit"
            type="number"
            min={0}
            className="field"
            defaultValue={existing?.dailyLimit ?? 0}
          />
          <p className="hint">0 = no cap.</p>
        </div>
      </div>

      <Toggle
        name="enabled"
        defaultChecked={existing ? existing.enabled : true}
        label="Enabled"
        hint="Disabled providers are skipped entirely."
      />

      <div className="flex gap-2">
        <SubmitButton pendingLabel="Saving…">{existing ? 'Save changes' : 'Add provider'}</SubmitButton>
        {onCancel && (
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </ActionForm>
  );
}

export function AddProviderPanel({ catalog, kind }: { catalog: CatalogEntry[]; kind: ProviderKind }) {
  const [open, setOpen] = useState(false);
  const copy = KIND_COPY[kind];

  if (!open) {
    return (
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
        + Add {copy.title.toLowerCase()} provider
      </button>
    );
  }

  return (
    <div className="card mt-3 p-5">
      <h3 className="mb-4 text-sm font-semibold text-slate-900">Add a {copy.title.toLowerCase()} provider</h3>
      <ProviderForm catalog={catalog} onCancel={() => setOpen(false)} />
    </div>
  );
}

export function EditProviderPanel({
  catalog,
  provider,
}: {
  catalog: CatalogEntry[];
  provider: ExistingProvider;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen((v) => !v)}>
        {open ? 'Close' : 'Edit'}
      </button>
      {open && (
        <div className="card mt-3 w-full p-5">
          <ProviderForm catalog={catalog} existing={provider} onCancel={() => setOpen(false)} />
        </div>
      )}
    </>
  );
}

export function KindHeader({ kind }: { kind: ProviderKind }) {
  const copy = KIND_COPY[kind];
  return (
    <div>
      <h2 className="text-base font-semibold text-slate-900">{copy.title}</h2>
      <p className="mt-0.5 max-w-2xl text-sm text-slate-500">{copy.blurb}</p>
    </div>
  );
}
