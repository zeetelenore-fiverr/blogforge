import { redirect } from 'next/navigation';
import { hasAnyUser } from '@/lib/auth';
import { createOwnerAction } from '../actions';
import { ActionForm, SubmitButton } from '@/components/admin/ui';

export const dynamic = 'force-dynamic';

/**
 * First-run installer. The database builds itself on the first request, so the
 * only thing left is creating the owner account — which means a Vercel deploy
 * never needs a terminal.
 */
export default async function SetupPage() {
  if (await hasAnyUser()) redirect('/admin/login');

  return (
    <div className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <span className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-xl bg-slate-900 text-sm font-black text-white">
            BF
          </span>
          <h1 className="text-xl font-bold text-slate-900">Set up BlogForge</h1>
          <p className="mt-1 text-sm text-slate-500">
            Your database is ready. Create the owner account to finish.
          </p>
        </div>

        <ActionForm action={createOwnerAction} className="card space-y-4 p-6">
          <div>
            <label className="label" htmlFor="name">
              Your name
            </label>
            <input id="name" name="name" required defaultValue="Editorial Team" className="field" />
            <p className="hint">Used as the byline and author page on every article.</p>
          </div>
          <div>
            <label className="label" htmlFor="email">
              Email
            </label>
            <input id="email" name="email" type="email" autoComplete="username" required className="field" />
          </div>
          <div>
            <label className="label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              className="field"
            />
            <p className="hint">At least 8 characters.</p>
          </div>
          <div>
            <label className="label" htmlFor="siteUrl">
              Public site URL
            </label>
            <input
              id="siteUrl"
              name="siteUrl"
              type="url"
              placeholder="https://your-blog.vercel.app"
              className="field"
            />
            <p className="hint">
              Canonical URLs, the sitemap and schema all use this. You can change it later in Settings.
            </p>
          </div>

          <SubmitButton className="btn btn-primary w-full justify-center" pendingLabel="Creating…">
            Create account and finish
          </SubmitButton>
        </ActionForm>

        <p className="mt-4 text-center text-xs text-slate-500">
          This page disappears once an account exists.
        </p>
      </div>
    </div>
  );
}
