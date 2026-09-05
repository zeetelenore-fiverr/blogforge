import Link from 'next/link';

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    published: 'badge-good',
    draft: 'badge-mute',
    scheduled: 'badge-info',
    failed: 'badge-bad',
    active: 'badge-good',
    paused: 'badge-mute',
    completed: 'badge-info',
    pending: 'badge-mute',
    running: 'badge-info',
    done: 'badge-good',
    cancelled: 'badge-mute',
    ok: 'badge-good',
    error: 'badge-bad',
    rate_limited: 'badge-warn',
    unknown: 'badge-mute',
  };
  return <span className={`badge ${map[status] || 'badge-mute'}`}>{status.replace('_', ' ')}</span>;
}

export function PolicyBadge({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    pass: ['badge-good', 'policy clear'],
    review: ['badge-warn', 'needs review'],
    fail: ['badge-bad', 'policy risk'],
    unchecked: ['badge-mute', 'not checked'],
  };
  const [tone, label] = map[status] || map.unchecked;
  return <span className={`badge ${tone}`}>{label}</span>;
}

export function ScorePill({ score }: { score: number }) {
  const tone = score >= 80 ? 'badge-good' : score >= 60 ? 'badge-warn' : 'badge-bad';
  return <span className={`badge ${tone}`}>{score}</span>;
}

export function ScoreRing({ score, size = 46 }: { score: number; size?: number }) {
  const color = score >= 80 ? '#16a34a' : score >= 60 ? '#d97706' : '#dc2626';
  return (
    <div
      className="ring"
      style={
        { '--v': score, '--ring-color': color, width: size, height: size } as React.CSSProperties
      }
      role="img"
      aria-label={`SEO score ${score} out of 100`}
    >
      <span style={{ width: size - 10, height: size - 10, color }}>{score}</span>
    </div>
  );
}

export function EmptyState({
  title,
  body,
  actionLabel,
  actionHref,
}: {
  title: string;
  body: string;
  actionLabel?: string;
  actionHref?: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
      <p className="font-semibold text-slate-800">{title}</p>
      <p className="mx-auto mt-1.5 max-w-md text-sm text-slate-500">{body}</p>
      {actionLabel && actionHref && (
        <Link href={actionHref} className="btn btn-primary mt-4">
          {actionLabel}
        </Link>
      )}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-slate-500">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </header>
  );
}
