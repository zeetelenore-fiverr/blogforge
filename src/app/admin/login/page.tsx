import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { signInAction } from '../actions';
import { ActionForm, SubmitButton } from '@/components/admin/ui';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  if (await currentUser()) redirect('/admin');

  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <span className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-xl bg-blue-600 text-sm font-black text-white">
            BF
          </span>
          <h1 className="text-xl font-bold text-slate-900">Sign in to BlogForge</h1>
          <p className="mt-1 text-sm text-slate-500">Your blog automation dashboard.</p>
        </div>

        <ActionForm action={signInAction} className="card space-y-4 p-6">
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
              autoComplete="current-password"
              required
              className="field"
            />
          </div>
          <SubmitButton className="btn btn-primary w-full justify-center" pendingLabel="Signing in…">
            Sign in
          </SubmitButton>
        </ActionForm>

        <p className="mt-4 text-center text-xs text-slate-500">
          Lost the password from setup? Re-run <code className="rounded bg-slate-200 px-1">npm run setup</code> after
          deleting the user row, or reset it directly in the database.
        </p>
      </div>
    </div>
  );
}
