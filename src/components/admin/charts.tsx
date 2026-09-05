import { escapeHtml } from '@/lib/util';

/**
 * Server-rendered SVG charts. No charting library, no client JavaScript — the
 * dashboard is a server component and these are just shapes.
 *
 * Palette note: the categorical trio and the ordinal blue ramp below were both
 * run through the dataviz validator (CVD separation, normal-vision floor,
 * lightness banding, adjacent-step ΔL). Do not substitute hexes by eye; re-run
 * the validator if the brand changes.
 *
 * Tooltips use native <title>, which is keyboard- and screen-reader reachable
 * without shipping an interaction layer. Every chart is paired with visible
 * labels or a table so nothing depends on colour alone.
 */

/** Validated categorical order — identity, never magnitude. */
export const CATEGORICAL = ['#2a78d6', '#eb6834', '#1baf7a'] as const;

/** Validated ordinal ramp — one hue, light → dark, visible step gaps. */
export const ORDINAL = ['#86b6ef', '#5598e7', '#2a78d6', '#1c5cab', '#0d366b'] as const;

/** Reserved status colours. Never used for a series. */
export const STATUS = {
  good: '#0ca30c',
  warning: '#fab219',
  serious: '#ec835a',
  critical: '#d03b3b',
  neutral: '#94a3b8',
} as const;

const INK = '#0f172a';
const INK_MUTED = '#64748b';
const GRID = '#e2e8f0';

/* ------------------------------------------------------------ stat tile */

export function StatTile({
  label,
  value,
  suffix,
  hint,
  spark,
  tone,
}: {
  label: string;
  value: string | number;
  suffix?: string;
  hint?: string;
  spark?: number[];
  tone?: keyof typeof STATUS;
}) {
  return (
    <div className="card p-4">
      <p className="text-xs font-medium uppercase tracking-wide" style={{ color: INK_MUTED }}>
        {label}
      </p>
      <p className="mt-1 flex items-baseline gap-1">
        <span
          className="text-2xl font-bold tabular-nums"
          style={{ color: tone ? STATUS[tone] : INK }}
        >
          {typeof value === 'number' ? value.toLocaleString() : value}
        </span>
        {suffix && (
          <span className="text-sm font-medium" style={{ color: INK_MUTED }}>
            {suffix}
          </span>
        )}
      </p>
      {spark && spark.length > 1 && <Sparkline values={spark} />}
      {hint && (
        <p className="mt-1 text-xs" style={{ color: INK_MUTED }}>
          {hint}
        </p>
      )}
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const w = 120;
  const h = 24;
  const max = Math.max(...values, 1);
  const step = values.length > 1 ? w / (values.length - 1) : w;
  const points = values.map((v, i) => `${(i * step).toFixed(1)},${(h - (v / max) * h).toFixed(1)}`);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-2 h-6 w-full" role="img" aria-label="Recent trend" preserveAspectRatio="none">
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke={CATEGORICAL[0]}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/* ------------------------------------------------------ time-series area */

export type TimePoint = { label: string; value: number };

/**
 * Publishing cadence. Single series, so sequential blue and no legend — the
 * heading names it.
 */
export function AreaChart({
  data,
  height = 180,
  unit = 'article',
}: {
  data: TimePoint[];
  height?: number;
  unit?: string;
}) {
  if (data.length < 2) return <Empty message="Not enough history yet." />;

  const w = 720;
  const padL = 34;
  const padR = 8;
  const padT = 12;
  const padB = 24;
  const plotW = w - padL - padR;
  const plotH = height - padT - padB;

  const max = Math.max(...data.map((d) => d.value), 1);
  const peakIndex = data.findIndex((d) => d.value === max);
  const niceMax = niceCeiling(max);
  const step = plotW / (data.length - 1);

  const x = (i: number) => padL + i * step;
  const y = (v: number) => padT + plotH - (v / niceMax) * plotH;

  const line = data.map((d, i) => `${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(' ');
  const area = `${padL},${padT + plotH} ${line} ${padL + plotW},${padT + plotH}`;

  const ticks = [0, Math.round(niceMax / 2), niceMax];
  // Label roughly six dates, never every one.
  const labelEvery = Math.max(1, Math.ceil(data.length / 6));

  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${w} ${height}`} className="w-full" role="img"
        aria-label={`${unit} count over ${data.length} days, peaking at ${max}`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={w - padR} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
            <text x={padL - 6} y={y(t) + 3.5} textAnchor="end" fontSize={10} fill={INK_MUTED}>
              {t}
            </text>
          </g>
        ))}

        <polygon points={area} fill={CATEGORICAL[0]} fillOpacity={0.12} />
        <polyline
          points={line}
          fill="none"
          stroke={CATEGORICAL[0]}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {data.map((d, i) => (
          <g key={d.label}>
            {/* generous invisible hit area, per the interaction spec */}
            <rect
              x={x(i) - step / 2}
              y={padT}
              width={step}
              height={plotH}
              fill="transparent"
            >
              <title>{`${d.label}: ${d.value} ${unit}${d.value === 1 ? '' : 's'}`}</title>
            </rect>
            {/* Mark the peak only when there is a real peak to point at —
                with a max of 1 every non-zero day would qualify. */}
            {max > 1 && d.value === max && i === peakIndex && (
              <circle cx={x(i)} cy={y(d.value)} r={4} fill={CATEGORICAL[0]} stroke="#fff" strokeWidth={2} />
            )}
          </g>
        ))}

        {data.map((d, i) =>
          i % labelEvery === 0 ? (
            <text key={`l-${d.label}`} x={x(i)} y={height - 6} textAnchor="middle" fontSize={10} fill={INK_MUTED}>
              {d.label}
            </text>
          ) : null,
        )}
      </svg>
    </figure>
  );
}

/* ----------------------------------------------------------- bar chart */

export type Bar = { label: string; value: number; note?: string };

/** Magnitude, low → high. Sequential ramp, values labelled directly. */
export function BarChart({
  data,
  colors = ORDINAL,
  height = 190,
}: {
  data: Bar[];
  colors?: readonly string[];
  height?: number;
}) {
  if (!data.length || data.every((d) => d.value === 0)) {
    return <Empty message="No data to chart yet." />;
  }

  const w = 520;
  const padT = 18;
  const padB = 38;
  const plotH = height - padT - padB;
  const max = niceCeiling(Math.max(...data.map((d) => d.value), 1));
  const slot = w / data.length;
  const barW = Math.min(64, slot * 0.62);

  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${w} ${height}`} className="w-full" role="img"
        aria-label={data.map((d) => `${d.label}: ${d.value}`).join('; ')}>
        <line x1={0} x2={w} y1={padT + plotH} y2={padT + plotH} stroke={GRID} strokeWidth={1} />

        {data.map((d, i) => {
          const h = (d.value / max) * plotH;
          const x = i * slot + (slot - barW) / 2;
          const y = padT + plotH - h;
          return (
            <g key={d.label}>
              {h > 0 && (
                // 4px rounded top, square foot on the baseline
                <path
                  d={roundedTopBar(x, y, barW, h, 4)}
                  fill={colors[i % colors.length]}
                >
                  <title>{`${d.label}: ${d.value}${d.note ? ` — ${d.note}` : ''}`}</title>
                </path>
              )}
              <text x={x + barW / 2} y={Math.max(padT - 5, y - 6)} textAnchor="middle" fontSize={11} fontWeight={700} fill={INK}>
                {d.value}
              </text>
              <text x={x + barW / 2} y={padT + plotH + 15} textAnchor="middle" fontSize={10} fill={INK_MUTED}>
                {d.label}
              </text>
              {d.note && (
                <text x={x + barW / 2} y={padT + plotH + 28} textAnchor="middle" fontSize={9} fill={INK_MUTED}>
                  {d.note}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

/* -------------------------------------------------- stacked part-to-whole */

export type Segment = { label: string; value: number; color: string; icon?: string };

/**
 * Part-to-whole as a single horizontal bar plus a labelled legend. Preferred
 * over a donut: exact values stay readable and there is no angle to misjudge.
 * A 2px surface gap separates adjacent fills.
 */
export function StackedBar({ segments, total }: { segments: Segment[]; total?: number }) {
  const sum = total ?? segments.reduce((n, s) => n + s.value, 0);
  if (sum === 0) return <Empty message="Nothing to break down yet." />;

  const w = 520;
  const h = 16;
  let x = 0;

  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: h }} role="img"
        aria-label={segments.map((s) => `${s.label}: ${s.value}`).join('; ')} preserveAspectRatio="none">
        {segments.map((s) => {
          if (s.value === 0) return null;
          const segW = (s.value / sum) * w;
          const rect = (
            <rect key={s.label} x={x} y={0} width={Math.max(0, segW - 2)} height={h} rx={2} fill={s.color}>
              <title>{`${s.label}: ${s.value} (${Math.round((s.value / sum) * 100)}%)`}</title>
            </rect>
          );
          x += segW;
          return rect;
        })}
      </svg>

      <figcaption className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
        {segments.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5 text-xs">
            <span
              aria-hidden
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ background: s.color }}
            />
            <span style={{ color: INK_MUTED }}>{s.label}</span>
            <span className="font-semibold tabular-nums" style={{ color: INK }}>
              {s.value}
            </span>
            <span style={{ color: INK_MUTED }}>({Math.round((s.value / sum) * 100)}%)</span>
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

/* ------------------------------------------------------- horizontal bars */

/** Ranked list — long category names stay readable running horizontally. */
export function RankedBars({ data, color = CATEGORICAL[0] }: { data: Bar[]; color?: string }) {
  if (!data.length) return <Empty message="Nothing to rank yet." />;
  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <ul className="space-y-2.5">
      {data.map((d) => (
        <li key={d.label}>
          <div className="flex items-baseline justify-between gap-3 text-xs">
            <span className="truncate font-medium" style={{ color: INK }}>
              {d.label}
            </span>
            <span className="shrink-0 tabular-nums" style={{ color: INK_MUTED }}>
              {d.value}
              {d.note && <span className="ml-1.5">{d.note}</span>}
            </span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-sm" style={{ background: GRID }}>
            <div
              className="h-full rounded-sm"
              style={{ width: `${Math.max(2, (d.value / max) * 100)}%`, background: color }}
              title={`${d.label}: ${d.value}`}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------- meter */

/** One ratio against a limit — same-ramp track, never a two-slice pie. */
export function Meter({ value, max, label, tone }: { value: number; max: number; label: string; tone?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span style={{ color: INK_MUTED }}>{label}</span>
        <span className="font-semibold tabular-nums" style={{ color: INK }}>
          {value}/{max}
        </span>
      </div>
      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full" style={{ background: GRID }}>
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, background: tone || CATEGORICAL[0] }}
          role="meter"
          aria-valuenow={value}
          aria-valuemin={0}
          aria-valuemax={max}
          aria-label={label}
        />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- bits */

export function ChartCard({
  title,
  description,
  children,
  action,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="card p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold" style={{ color: INK }}>
            {title}
          </h2>
          {description && (
            <p className="mt-0.5 max-w-lg text-xs" style={{ color: INK_MUTED }}>
              {description}
            </p>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Empty({ message }: { message: string }) {
  return (
    <p className="py-8 text-center text-xs" style={{ color: INK_MUTED }}>
      {message}
    </p>
  );
}

/** Bar with rounded data-end, square foot on the baseline. */
function roundedTopBar(x: number, y: number, w: number, h: number, r: number): string {
  const radius = Math.min(r, h, w / 2);
  return [
    `M ${x} ${y + h}`,
    `L ${x} ${y + radius}`,
    `Q ${x} ${y} ${x + radius} ${y}`,
    `L ${x + w - radius} ${y}`,
    `Q ${x + w} ${y} ${x + w} ${y + radius}`,
    `L ${x + w} ${y + h}`,
    'Z',
  ].join(' ');
}

function niceCeiling(n: number): number {
  if (n <= 5) return 5;
  if (n <= 10) return 10;
  const mag = 10 ** Math.floor(Math.log10(n));
  return Math.ceil(n / mag) * mag;
}

export { escapeHtml };
