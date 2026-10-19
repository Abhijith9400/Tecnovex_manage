"use client";

import type { IconComponent } from "@/components/ui/icons";
import type { ReactNode } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/utils";

/**
 * Validated categorical palette, used in this fixed order (never cycled). Three slots sit below 3:1 contrast
 * on white, so every chart here also shows its values as text (legend with numbers).
 */
export const PALETTE = ["#2A78D6", "#EB6834", "#1BAF7A", "#EDA100", "#E87BA4", "#008300"] as const;
const OTHER = "#94A3B8";
const GRID = "#E2E8F0";
const AXIS = "#64748B";
const SURFACE = "#FFFFFF";

const compact = new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 });
export const formatCompact = (n: number) => compact.format(n);

/** Solid hero banner at the top of a personal dashboard. */
export function HeroBanner({ eyebrow, title, subtitle, stats }: { eyebrow: string; title: string; subtitle?: string; stats: { label: string; value: ReactNode }[] }) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-ink p-6 text-white sm:p-8">
      <div className="absolute -right-10 -bottom-16 size-56 rounded-full border-[28px] border-white/5" aria-hidden />
      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-wider text-orange-300 uppercase">{eyebrow}</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-slate-300">{subtitle}</p>}
        </div>
        <div className="flex flex-wrap gap-3">
          {stats.map((s) => (
            <div key={s.label} className="min-w-[120px] rounded-xl bg-white/[0.07] px-4 py-3 ring-1 ring-white/10">
              <p className="text-2xl font-semibold tabular-nums">{s.value}</p>
              <p className="text-xs text-slate-300">{s.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const TONES = {
  blue: "bg-blue-50 text-blue-600",
  orange: "bg-accent-soft text-accent",
  green: "bg-emerald-50 text-emerald-600",
  violet: "bg-violet-50 text-violet-600",
  red: "bg-red-50 text-danger",
  pink: "bg-pink-50 text-pink-600",
};

/** Colourful KPI tile with an optional change chip. */
export function Kpi({ label, value, hint, icon: Icon, tone, alert, delta }: { label: string; value: ReactNode; hint?: string; icon: IconComponent; tone: keyof typeof TONES; alert?: boolean; delta?: number | null }) {
  return (
    <div className={cn("rounded-2xl border bg-card p-4 transition-all hover:-translate-y-0.5 hover:shadow-md", alert ? "border-red-200" : "border-line")}>
      <div className="flex items-start justify-between gap-2">
        <span className={cn("flex size-10 items-center justify-center rounded-xl", alert ? TONES.red : TONES[tone])}>
          <Icon className="size-5" aria-hidden />
        </span>
        {delta !== undefined && delta !== null && (
          <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums", delta > 0 ? "bg-emerald-50 text-emerald-700" : delta < 0 ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600")}>
            {delta > 0 ? "▲" : delta < 0 ? "▼" : "•"} {Math.abs(delta)}% vs last month
          </span>
        )}
      </div>
      <p className={cn("mt-3 text-2xl font-semibold tabular-nums", alert ? "text-danger" : "text-ink")}>{value}</p>
      <p className="text-sm font-medium text-ink">{label}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function ChartCard({ title, subtitle, children, className, action }: { title: string; subtitle?: string; children: ReactNode; className?: string; action?: ReactNode }) {
  return (
    <section className={cn("min-w-0 rounded-2xl border border-line bg-card p-5", className)}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function TooltipBox({ title, rows }: { title: string; rows: { color?: string; label: string; value: string }[] }) {
  return (
    <div className="rounded-lg border border-line bg-card px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold text-ink">{title}</p>
      {rows.map((r) => (
        <p key={r.label} className="flex justify-between gap-6 text-ink">
          <span className="flex items-center gap-1.5">
            {r.color && <span className="size-2 rounded-sm" style={{ background: r.color }} />}
            {r.label}
          </span>
          <span className="tabular-nums">{r.value}</span>
        </p>
      ))}
    </div>
  );
}

export interface Slice {
  label: string;
  value: number;
}

/** Up to 5 named slices; the rest fold into "Other" (a 9th generated hue would be unreadable). */
function foldSlices(slices: Slice[], max = 5, colors: readonly string[] = PALETTE): (Slice & { color: string })[] {
  // Colour follows the slice's position in the input (its identity), not its rank after filtering.
  const sorted = slices.map((s, i) => ({ ...s, color: colors[i] ?? OTHER })).filter((s) => s.value > 0);
  const head = sorted.slice(0, max);
  const rest = sorted.slice(max).reduce((sum, s) => sum + s.value, 0);
  return rest > 0 ? [...head, { label: "Other", value: rest, color: OTHER }] : head;
}

/** Donut with the total in the middle and a legend that lists every value. */
export function Donut({
  slices,
  centerLabel,
  format = (n: number) => String(n),
  emptyText = "Nothing yet",
  colors,
}: {
  slices: Slice[];
  centerLabel: string;
  format?: (n: number) => string;
  emptyText?: string;
  /** Fixed colours per slice, e.g. task stages that must match the task board. */
  colors?: readonly string[];
}) {
  const data = foldSlices(slices, 5, colors);
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <p className="py-10 text-center text-sm text-muted">{emptyText}</p>;
  const split = data.length > 1;
  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row">
      <div className="relative size-40 shrink-0" role="img" aria-label={`${centerLabel}: ${data.map((d) => `${d.label} ${format(d.value)}`).join(", ")}`}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="label" innerRadius="66%" outerRadius="100%" paddingAngle={split ? 2 : 0} stroke={split ? SURFACE : "none"} strokeWidth={2}>
              {data.map((d) => (
                <Cell key={d.label} fill={d.color} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <TooltipBox title={String(payload[0].name)} rows={[{ label: `${Math.round((Number(payload[0].value) / total) * 100)}%`, value: format(Number(payload[0].value)) }]} />
                ) : null
              }
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold text-ink tabular-nums">{format(total)}</span>
          <span className="text-[11px] text-muted">{centerLabel}</span>
        </div>
      </div>
      <ul className="w-full space-y-2">
        {data.map((d) => (
          <li key={d.label} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2 text-ink">
              <span className="size-2.5 shrink-0 rounded-sm" style={{ background: d.color }} aria-hidden />
              <span className="truncate">{d.label}</span>
            </span>
            <span className="shrink-0 font-medium text-ink tabular-nums">
              {format(d.value)}
              <span className="ml-1.5 text-xs font-normal text-muted">{Math.round((d.value / total) * 100)}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** One series over time as a soft area. */
export function AreaTrend({ points, color = PALETTE[0], unit, ariaLabel, height = 220 }: { points: { label: string; value: number }[]; color?: string; unit: string; ariaLabel: string; height?: number }) {
  return (
    <div style={{ height }} className="w-full" role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: GRID }} tick={{ fill: AXIS, fontSize: 11 }} interval="preserveStartEnd" minTickGap={12} />
          <YAxis tickLine={false} axisLine={false} width={36} tick={{ fill: AXIS, fontSize: 11 }} tickFormatter={formatCompact} allowDecimals={false} />
          <Tooltip
            cursor={{ stroke: "#94A3B8", strokeDasharray: "4 4" }}
            content={({ active, payload }) =>
              active && payload?.length ? <TooltipBox title={String((payload[0].payload as { label: string }).label)} rows={[{ color, label: unit, value: Number(payload[0].value).toLocaleString("en-IN") }]} /> : null
            }
          />
          <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill={color} fillOpacity={0.12} dot={false} activeDot={{ r: 5, stroke: SURFACE, strokeWidth: 2 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Vertical bars, optionally stacked by series (series keep their palette slot). */
export function Bars({
  rows,
  series,
  ariaLabel,
  height = 240,
}: {
  rows: Record<string, string | number>[];
  series: { key: string; label: string }[];
  ariaLabel: string;
  height?: number;
}) {
  const colored = series.map((s, i) => ({ ...s, color: PALETTE[i] ?? OTHER }));
  const last = colored.length - 1;
  return (
    <div className="w-full">
      <div style={{ height }} className="w-full" role="img" aria-label={ariaLabel}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} barCategoryGap="30%" margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: GRID }} tick={{ fill: AXIS, fontSize: 11 }} />
            <YAxis tickLine={false} axisLine={false} width={32} tick={{ fill: AXIS, fontSize: 11 }} allowDecimals={false} />
            <Tooltip
              cursor={{ fill: "#F1F5F9" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0].payload as Record<string, string | number>;
                return <TooltipBox title={String(row.label)} rows={colored.map((s) => ({ color: s.color, label: s.label, value: String(row[s.key] ?? 0) }))} />;
              }}
            />
            {colored.map((s, i) => (
              <Bar key={s.key} dataKey={s.key} name={s.label} stackId="s" fill={s.color} stroke={SURFACE} strokeWidth={series.length > 1 ? 1 : 0} radius={i === last ? [4, 4, 0, 0] : 0} maxBarSize={36} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      {colored.length > 1 && (
        <ul className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-ink">
          {colored.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm" style={{ background: s.color }} aria-hidden />
              {s.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Ranked horizontal bars with the value written at the end of each bar. */
export function RankedBars({ items, format = (n: number) => String(n), color = PALETTE[0] }: { items: { label: string; value: number }[]; format?: (n: number) => string; color?: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (items.length === 0) return <p className="py-10 text-center text-sm text-muted">Nothing yet</p>;
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.label}>
          <div className="mb-1 flex items-center justify-between gap-3 text-sm">
            <span className="truncate text-ink">{item.label}</span>
            <span className="shrink-0 font-medium text-ink tabular-nums">{format(item.value)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full" style={{ width: `${(item.value / max) * 100}%`, background: color }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Short month label for YYYY-MM. */
export function monthShort(period: string) {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" });
}

/** Percent change, or null when there is nothing to compare against. */
export function percentChange(current: number, previous: number) {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}
