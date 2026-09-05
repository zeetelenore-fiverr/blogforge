'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import type { ActionState } from '@/app/admin/actions';

/* --------------------------------------------------------------- buttons */

export function SubmitButton({
  children,
  className = 'btn btn-primary',
  pendingLabel,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} {...rest}>
      {pending ? pendingLabel || 'Working…' : children}
    </button>
  );
}

/** Submit button that asks first — for deletes and other one-way doors. */
export function ConfirmButton({
  children,
  message = 'Are you sure? This cannot be undone.',
  className = 'btn btn-danger btn-sm',
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { message?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={className}
      disabled={pending}
      onClick={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
      {...rest}
    >
      {pending ? '…' : children}
    </button>
  );
}

export function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1600);
        } catch {
          setDone(false);
        }
      }}
    >
      {done ? 'Copied' : label}
    </button>
  );
}

/* ---------------------------------------------------------------- alerts */

export function Alert({ state }: { state: ActionState }) {
  if (!state?.error && !state?.message) return null;
  const bad = !!state.error;
  return (
    <div
      role={bad ? 'alert' : 'status'}
      className={`rounded-lg border px-3.5 py-2.5 text-sm ${
        bad ? 'border-red-200 bg-red-50 text-red-800' : 'border-green-200 bg-green-50 text-green-800'
      }`}
    >
      {state.error || state.message}
    </div>
  );
}

/* ------------------------------------------------------------------ form */

/**
 * Wraps a server action so the page gets inline success/error feedback without
 * every screen re-implementing useActionState.
 */
export function ActionForm({
  action,
  children,
  className = '',
  onDone,
  resetOnSuccess = false,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  className?: string;
  onDone?: (state: ActionState) => void;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction] = useActionState(action, {});
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      onDone?.(state);
      if (resetOnSuccess) ref.current?.reset();
    }
  }, [state, onDone, resetOnSuccess]);

  return (
    <form ref={ref} action={formAction} className={className}>
      <Alert state={state} />
      {children}
    </form>
  );
}

/* --------------------------------------------------------------- widgets */

export function Toggle({
  name,
  defaultChecked,
  label,
  hint,
}: {
  name: string;
  defaultChecked?: boolean;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 accent-blue-600"
      />
      <span>
        <span className="block text-sm font-medium text-slate-800">{label}</span>
        {hint && <span className="block text-xs text-slate-500">{hint}</span>}
      </span>
    </label>
  );
}

export function Collapse({
  title,
  children,
  open = false,
  badge,
}: {
  title: string;
  children: React.ReactNode;
  open?: boolean;
  badge?: string;
}) {
  return (
    <details open={open} className="card group">
      <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3.5">
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          {title}
          {badge && <span className="badge badge-mute">{badge}</span>}
        </span>
        <span className="text-slate-400 transition group-open:rotate-90" aria-hidden>
          ›
        </span>
      </summary>
      <div className="border-t border-slate-200 px-5 py-4">{children}</div>
    </details>
  );
}

export function Tabs({ tabs }: { tabs: { id: string; label: string; content: React.ReactNode }[] }) {
  const [active, setActive] = useState(tabs[0]?.id);
  return (
    <div>
      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActive(t.id)}
            className={`whitespace-nowrap border-b-2 px-3.5 py-2 text-sm font-medium transition ${
              active === t.id
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.id} hidden={active !== t.id}>
          {t.content}
        </div>
      ))}
    </div>
  );
}

/** Live character counter for title/description fields with SERP limits. */
export function CountedField({
  name,
  defaultValue = '',
  ideal,
  max,
  textarea = false,
  placeholder,
  rows = 3,
}: {
  name: string;
  defaultValue?: string;
  ideal: [number, number];
  max: number;
  textarea?: boolean;
  placeholder?: string;
  rows?: number;
}) {
  const [value, setValue] = useState(defaultValue);
  const len = value.length;
  const state = len === 0 ? 'empty' : len < ideal[0] ? 'short' : len > max ? 'over' : len > ideal[1] ? 'long' : 'good';
  const colors: Record<string, string> = {
    empty: 'text-slate-400',
    short: 'text-amber-600',
    good: 'text-green-600',
    long: 'text-amber-600',
    over: 'text-red-600',
  };

  const shared = {
    name,
    value,
    placeholder,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setValue(e.target.value),
    className: 'field',
  };

  return (
    <div>
      {textarea ? <textarea {...shared} rows={rows} /> : <input {...shared} type="text" />}
      <p className={`mt-1 text-xs font-medium ${colors[state]}`}>
        {len} characters · ideal {ideal[0]}–{ideal[1]}
        {len > max && ' · Google will truncate this'}
      </p>
    </div>
  );
}

/** Auto-refreshes a page while background work is in flight. */
export function AutoRefresh({ enabled, seconds = 5 }: { enabled: boolean; seconds?: number }) {
  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(() => {
      // A full reload is heavier than router.refresh() but survives the
      // streaming edge cases that leave a stale server component tree.
      window.location.reload();
    }, seconds * 1000);
    return () => clearInterval(t);
  }, [enabled, seconds]);
  return null;
}

/** Checkbox list header that selects/deselects every row in a bulk form. */
export function SelectAll({ name = 'ids' }: { name?: string }) {
  return (
    <input
      type="checkbox"
      aria-label="Select all"
      className="h-4 w-4 rounded border-slate-300 accent-blue-600"
      onChange={(e) => {
        const form = e.currentTarget.closest('form');
        form?.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`).forEach((box) => {
          box.checked = e.currentTarget.checked;
        });
      }}
    />
  );
}
