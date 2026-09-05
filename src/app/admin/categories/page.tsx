import Link from 'next/link';
import { asc, sql } from 'drizzle-orm';
import { db, categories } from '@/db';
import { requireUser } from '@/lib/auth';
import { PageHeader } from '@/components/admin/bits';
import { ActionForm, SubmitButton, ConfirmButton, Collapse } from '@/components/admin/ui';
import { saveCategoryAction, deleteCategoryAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function CategoriesPage() {
  await requireUser();

  const rows = await db
    .select({
      c: categories,
      count: sql<number>`(SELECT COUNT(*)::int FROM posts WHERE posts.category_id = ${categories.id} AND posts.status = 'published')`,
    })
    .from(categories)
    .orderBy(asc(categories.name));

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Categories"
        description="Categories drive the site navigation and the topic pages Google uses to understand what this blog is about. Three to eight well-populated ones beat twenty thin ones."
      />

      <div className="card mb-6 p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Add a category</h2>
        <ActionForm action={saveCategoryAction} className="space-y-3" resetOnSuccess>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="new-name">
                Name
              </label>
              <input id="new-name" name="name" required className="field" placeholder="Buying guides" />
            </div>
            <div>
              <label className="label" htmlFor="new-slug">
                Slug
              </label>
              <input id="new-slug" name="slug" className="field font-mono text-xs" placeholder="buying-guides" />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="new-description">
              Description
            </label>
            <textarea
              id="new-description"
              name="description"
              rows={2}
              className="field"
              placeholder="Shown on the category page and used in its meta description."
            />
          </div>
          <SubmitButton pendingLabel="Saving…">Add category</SubmitButton>
        </ActionForm>
      </div>

      <ul className="space-y-3">
        {rows.map(({ c, count }) => (
          <li key={c.id}>
            <Collapse title={c.name} badge={`${Number(count)} posts`}>
              <ActionForm action={saveCategoryAction} className="space-y-3">
                <input type="hidden" name="id" value={c.id} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor={`name-${c.id}`}>
                      Name
                    </label>
                    <input id={`name-${c.id}`} name="name" defaultValue={c.name} className="field" />
                  </div>
                  <div>
                    <label className="label" htmlFor={`slug-${c.id}`}>
                      Slug
                    </label>
                    <input
                      id={`slug-${c.id}`}
                      name="slug"
                      defaultValue={c.slug}
                      className="field font-mono text-xs"
                    />
                  </div>
                </div>
                <div>
                  <label className="label" htmlFor={`desc-${c.id}`}>
                    Description
                  </label>
                  <textarea
                    id={`desc-${c.id}`}
                    name="description"
                    rows={2}
                    defaultValue={c.description}
                    className="field"
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor={`mt-${c.id}`}>
                      Meta title
                    </label>
                    <input id={`mt-${c.id}`} name="metaTitle" defaultValue={c.metaTitle || ''} className="field" />
                  </div>
                  <div>
                    <label className="label" htmlFor={`md-${c.id}`}>
                      Meta description
                    </label>
                    <input
                      id={`md-${c.id}`}
                      name="metaDescription"
                      defaultValue={c.metaDescription || ''}
                      className="field"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
                  <Link
                    href={`/category/${c.slug}`}
                    target="_blank"
                    className="text-xs font-medium text-blue-600 hover:underline"
                  >
                    View page ↗
                  </Link>
                </div>
              </ActionForm>

              <form action={deleteCategoryAction} className="mt-3 border-t border-slate-100 pt-3">
                <input type="hidden" name="id" value={c.id} />
                <ConfirmButton message={`Delete "${c.name}"? Its posts become uncategorised.`}>
                  Delete category
                </ConfirmButton>
              </form>
            </Collapse>
          </li>
        ))}
      </ul>
    </div>
  );
}
