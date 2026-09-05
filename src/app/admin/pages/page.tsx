import Link from 'next/link';
import { asc } from 'drizzle-orm';
import { db, pages } from '@/db';
import { requireUser } from '@/lib/auth';
import { timeAgo } from '@/lib/util';
import { PageHeader } from '@/components/admin/bits';
import { ActionForm, SubmitButton, ConfirmButton, Collapse, Toggle } from '@/components/admin/ui';
import { savePageAction, deletePageAction } from '../actions';

export const dynamic = 'force-dynamic';

const REQUIRED_FOR_ADSENSE = ['about', 'contact', 'privacy-policy'];

export default async function PagesAdmin() {
  await requireUser();
  const rows = await db.select().from(pages).orderBy(asc(pages.sortOrder), asc(pages.title));
  const have = new Set(rows.filter((r) => r.status === 'published').map((r) => r.slug));
  const missing = REQUIRED_FOR_ADSENSE.filter((s) => !have.has(s));

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Pages"
        description="Standalone pages: About, Contact, Privacy Policy and anything else. AdSense review looks for these, and so do readers deciding whether to trust the site."
      />

      {missing.length > 0 && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-semibold">Missing pages an AdSense review expects</p>
          <p className="mt-1">{missing.join(', ')} — add them before applying.</p>
        </div>
      )}

      <div className="card mb-6 p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">New page</h2>
        <ActionForm action={savePageAction} className="space-y-3" resetOnSuccess>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="new-title">
                Title
              </label>
              <input id="new-title" name="title" required className="field" placeholder="Disclaimer" />
            </div>
            <div>
              <label className="label" htmlFor="new-slug">
                Slug
              </label>
              <input id="new-slug" name="slug" className="field font-mono text-xs" placeholder="disclaimer" />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="new-content">
              Content (Markdown)
            </label>
            <textarea id="new-content" name="contentMd" rows={6} className="field font-mono text-xs" />
          </div>
          <div className="flex flex-wrap gap-5">
            <Toggle name="showInHeader" label="Show in header" />
            <Toggle name="showInFooter" label="Show in footer" defaultChecked />
          </div>
          <SubmitButton pendingLabel="Saving…">Create page</SubmitButton>
        </ActionForm>
      </div>

      <ul className="space-y-3">
        {rows.map((p) => (
          <li key={p.id}>
            <Collapse
              title={p.title}
              badge={p.status === 'published' ? `/${p.slug}` : 'draft'}
            >
              <ActionForm action={savePageAction} className="space-y-3">
                <input type="hidden" name="id" value={p.id} />
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className="label" htmlFor={`t-${p.id}`}>
                      Title
                    </label>
                    <input id={`t-${p.id}`} name="title" defaultValue={p.title} className="field" />
                  </div>
                  <div>
                    <label className="label" htmlFor={`s-${p.id}`}>
                      Slug
                    </label>
                    <input id={`s-${p.id}`} name="slug" defaultValue={p.slug} className="field font-mono text-xs" />
                  </div>
                  <div>
                    <label className="label" htmlFor={`st-${p.id}`}>
                      Status
                    </label>
                    <select id={`st-${p.id}`} name="status" className="field" defaultValue={p.status}>
                      <option value="published">Published</option>
                      <option value="draft">Draft</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="label" htmlFor={`c-${p.id}`}>
                    Content (Markdown)
                  </label>
                  <textarea
                    id={`c-${p.id}`}
                    name="contentMd"
                    rows={16}
                    defaultValue={p.contentMd}
                    className="field font-mono text-[13px] leading-relaxed"
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor={`mt-${p.id}`}>
                      Meta title
                    </label>
                    <input id={`mt-${p.id}`} name="metaTitle" defaultValue={p.metaTitle} className="field" />
                  </div>
                  <div>
                    <label className="label" htmlFor={`md-${p.id}`}>
                      Meta description
                    </label>
                    <input
                      id={`md-${p.id}`}
                      name="metaDescription"
                      defaultValue={p.metaDescription}
                      className="field"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-5">
                  <Toggle name="showInHeader" label="Show in header" defaultChecked={p.showInHeader} />
                  <Toggle name="showInFooter" label="Show in footer" defaultChecked={p.showInFooter} />
                  <div>
                    <label className="label" htmlFor={`o-${p.id}`}>
                      Order
                    </label>
                    <input
                      id={`o-${p.id}`}
                      name="sortOrder"
                      type="number"
                      defaultValue={p.sortOrder}
                      className="field w-20"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <SubmitButton pendingLabel="Saving…">Save page</SubmitButton>
                  <span className="text-xs text-slate-500">
                    Updated {timeAgo(p.updatedAt)} ·{' '}
                    <Link href={`/${p.slug}`} target="_blank" className="font-medium text-blue-600 hover:underline">
                      View ↗
                    </Link>
                  </span>
                </div>
              </ActionForm>

              <form action={deletePageAction} className="mt-3 border-t border-slate-100 pt-3">
                <input type="hidden" name="id" value={p.id} />
                <ConfirmButton message={`Delete "${p.title}"?`}>Delete page</ConfirmButton>
              </form>
            </Collapse>
          </li>
        ))}
      </ul>
    </div>
  );
}
