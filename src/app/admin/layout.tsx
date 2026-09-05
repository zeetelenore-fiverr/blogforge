import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { currentUser } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { signOutAction } from './actions';

export const metadata: Metadata = {
  title: { default: 'Dashboard', template: '%s · BlogForge' },
  robots: { index: false, follow: false },
};

const NAV = [
  { group: 'Publish', items: [
    { href: '/admin', label: 'Overview', icon: '◧' },
    { href: '/admin/posts', label: 'Posts', icon: '≡' },
    { href: '/admin/campaigns', label: 'Campaigns', icon: '⟳' },
    { href: '/admin/keywords', label: 'Keywords', icon: '⌕' },
  ] },
  { group: 'Optimise', items: [
    { href: '/admin/reports', label: 'Reports', icon: '▦' },
    { href: '/admin/seo', label: 'SEO checker', icon: '◎' },
    { href: '/admin/indexing', label: 'Indexing', icon: '⚑' },
    { href: '/admin/policy', label: 'AdSense policy', icon: '⛨' },
    { href: '/admin/links', label: 'Internal links', icon: '⇄' },
  ] },
  { group: 'Site', items: [
    { href: '/admin/categories', label: 'Categories', icon: '▤' },
    { href: '/admin/pages', label: 'Pages', icon: '▭' },
    { href: '/admin/settings', label: 'Settings', icon: '⚙' },
    { href: '/admin/providers', label: 'AI providers', icon: '⚡' },
    { href: '/admin/activity', label: 'Activity', icon: '◷' },
  ] },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  const s = await getSettings();
  const pathname = (await headers()).get('x-pathname') || '';

  // The login page renders inside this layout but without the chrome.
  if (!user) return <div className="admin-body min-h-screen">{children}</div>;

  return (
    <div className="admin-body min-h-screen lg:flex">
      <aside className="border-b border-slate-800 bg-slate-900 text-slate-300 lg:min-h-screen lg:w-60 lg:shrink-0 lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between px-4 py-4 lg:block">
          <Link href="/admin" className="flex items-center gap-2 font-bold text-white">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-blue-600 text-xs font-black">BF</span>
            BlogForge
          </Link>
          <Link
            href="/"
            target="_blank"
            className="text-xs text-slate-400 hover:text-white lg:mt-3 lg:block"
          >
            View site ↗
          </Link>
        </div>

        <nav className="flex gap-1 overflow-x-auto px-2 pb-3 lg:block lg:space-y-5 lg:overflow-visible lg:px-3">
          {NAV.map((section) => (
            <div key={section.group} className="flex gap-1 lg:block">
              <p className="mb-1.5 hidden px-2 text-[10px] font-bold uppercase tracking-widest text-slate-500 lg:block">
                {section.group}
              </p>
              {section.items.map((item) => {
                const active = pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm transition lg:w-full ${
                      active ? 'bg-slate-800 font-semibold text-white' : 'hover:bg-slate-800/60 hover:text-white'
                    }`}
                  >
                    <span aria-hidden className="w-4 text-center text-slate-500">{item.icon}</span>
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="hidden border-t border-slate-800 p-3 lg:block">
          <p className="truncate px-2 text-xs font-medium text-slate-300">{user.name}</p>
          <p className="truncate px-2 text-[11px] text-slate-500">{user.email}</p>
          <form action={signOutAction} className="mt-2">
            <button className="w-full rounded-lg px-3 py-1.5 text-left text-xs text-slate-400 hover:bg-slate-800 hover:text-white">
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8 lg:py-8">{children}</div>
      </div>
    </div>
  );
}
