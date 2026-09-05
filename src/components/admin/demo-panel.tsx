'use client';

import Link from 'next/link';
import { seedDemoAction } from '@/app/admin/actions';
import { ActionForm, SubmitButton, Toggle } from './ui';

/**
 * Shown wherever the post list is empty. Loading the samples lets someone judge
 * the layout, the SEO scoring and the archive pages before they have added a
 * single API key.
 */
export function DemoContentPanel() {
  return (
    <div>
      <p className="text-sm font-semibold text-slate-900">No articles yet</p>
      <p className="mt-1 max-w-lg text-sm text-slate-600">
        Load six complete sample articles to see how the blog looks with real content — tables, FAQs,
        internal links, schema and SEO scores included. They are ordinary posts: edit or delete them
        whenever you like.
      </p>

      <ActionForm action={seedDemoAction} className="mt-4 space-y-3">
        <Toggle
          name="withImages"
          defaultChecked
          label="Generate featured images"
          hint="Uses the keyless Pollinations provider. Adds about a minute; untick to load instantly without images."
        />
        <div className="flex flex-wrap gap-2">
          <SubmitButton pendingLabel="Loading… this can take a minute">Load sample articles</SubmitButton>
          <Link href="/admin/posts/new" className="btn btn-ghost">
            Generate a real one instead
          </Link>
        </div>
      </ActionForm>
    </div>
  );
}
