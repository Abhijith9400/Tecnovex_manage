"use client";

import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/**
 * Validated categorical palette (lightness, chroma, CVD separation, contrast vs white), used in this order for
 * the three pipeline stages. Blue and teal are never placed next to each other.
 */
export const STAGE_COLORS = ["#2563EB", "#EA580C", "#0D9488"] as const;
const GRID = "#E2E8F0";
const AXIS_TEXT = "#64748B";
const SURFACE = "#FFFFFF";

export interface StageSlice {
  label: string;
  value: number;
}

function TooltipBox({ title, rows, footer }: { title: string; rows: { color?: string; label: string; value: number | string }[]; footer?: string }) {
  return (
    <div className="rounded-lg border border-line bg-card px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold text-ink">{title}</p>
      {rows.map((r) => (
        <p key={r.label} className="flex justify-between gap-6 text-ink">
          <span className="flex items-center gap-1.5">
            {r.color && <span className="size-2 rounded-sm" style={{ background: r.color }} />} {r.label}
          </span>
          <span className="tabular-nums">{r.value}</span>
        </p>
      ))}
      {footer && <p className="mt-1 border-t border-line pt-1 text-muted">{footer}</p>}
    </div>
  );
}

/** HTML legend in series order (the chart library's legend re-sorts entries). */
function SeriesLegend({ items, line }: { items: { label: string; color: string }[]; line?: boolean }) {
  return (
    <ul className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-ink">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span className={line ? "h-0.5 w-3.5 rounded-full" : "size-2.5 rounded-sm"} style={{ background: i.color }} aria-hidden />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

/** Donut of open items by stage, with the total in the middle and a labelled legend beside it. */
export function StageDonut({ slices, centerLabel }: { slices: StageSlice[]; centerLabel: string }) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  const data = total ? slices : [{ label: "None", value: 1 }];
  const split = slices.filter((x) => x.value > 0).length > 1;
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="relative size-44 shrink-0" role="img" aria-label={`${centerLabel}: ${slices.map((s) => `${s.label} ${s.value}`).join(", ")}`}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              innerRadius="68%"
              outerRadius="100%"
              paddingAngle={split ? 2 : 0}
              stroke={split ? SURFACE : "none"}
              strokeWidth={2}
              isAnimationActive
            >
              {data.map((s, i) => (
                <Cell key={s.label} fill={total ? STAGE_COLORS[i] : GRID} />
              ))}
            </Pie>
            {total > 0 && (
              <Tooltip
                content={({ active, payload }) =>
                  active && payload?.length ? (
                    <TooltipBox
                      title={String(payload[0].name)}
                      rows={[{ label: "Count", value: Number(payload[0].value) }]}
                      footer={`${Math.round((Number(payload[0].value) / total) * 100)}% of ${total}`}
                    />
                  ) : null
                }
              />
            )}
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-semibold text-ink tabular-nums">{total}</span>
          <span className="text-xs text-muted">{centerLabel}</span>
        </div>
      </div>
      <ul className="w-full space-y-2">
        {slices.map((s, i) => (
          <li key={s.label} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2 text-ink">
              <span className="size-2.5 rounded-sm" style={{ background: STAGE_COLORS[i] }} aria-hidden />
              {s.label}
            </span>
            <span className="font-medium text-ink tabular-nums">
              {s.value}
              <span className="ml-1.5 text-xs font-normal text-muted">{total ? Math.round((s.value / total) * 100) : 0}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface StackedRow {
  name: string;
  [key: string]: string | number;
}

/**
 * Horizontal stacked bars (one row per person or client). `series` keys map to STAGE_COLORS in order;
 * `extra` adds a line to the tooltip (e.g. overdue count).
 */
export function StackedBars({
  rows,
  series,
  ariaLabel,
  extra,
}: {
  rows: StackedRow[];
  series: { key: string; label: string; color: string }[];
  ariaLabel: string;
  extra?: (row: StackedRow) => string | undefined;
}) {
  const height = Math.max(130, rows.length * 40 + 30);
  const last = series.length - 1;
  return (
    <div className="w-full">
      <div style={{ height }} className="w-full" role="img" aria-label={ariaLabel}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" barCategoryGap="30%" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid horizontal={false} stroke={GRID} />
            <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: AXIS_TEXT, fontSize: 12 }} />
            <YAxis type="category" dataKey="name" width={120} tickLine={false} axisLine={false} tick={{ fill: "#0F172A", fontSize: 12 }} />
            <Tooltip
              cursor={{ fill: "#F1F5F9" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0].payload as StackedRow;
                const total = series.reduce((s, x) => s + Number(row[x.key] ?? 0), 0);
                return (
                  <TooltipBox
                    title={row.name}
                    rows={[
                      ...series.map((s) => ({
                        color: s.color,
                        label: s.label,
                        value: Number(row[s.key] ?? 0),
                      })),
                      { label: "Total", value: total },
                    ]}
                    footer={extra?.(row)}
                  />
                );
              }}
            />
            {series.map((s, i) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                stackId="stack"
                fill={s.color}
                stroke={SURFACE}
                strokeWidth={2}
                radius={i === last ? [0, 4, 4, 0] : 0}
                maxBarSize={22}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <SeriesLegend items={series} />
    </div>
  );
}

export interface TrendPoint {
  week: string;
  created: number;
  completed: number;
}

const CREATED = STAGE_COLORS[0];
const COMPLETED = STAGE_COLORS[1];

/** Tasks created vs completed per week. */
export function TaskTrendChart({ points }: { points: TrendPoint[] }) {
  const data = points.map((p) => ({
    ...p,
    label: new Date(`${p.week}T00:00:00Z`).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    }),
  }));
  return (
    <div className="w-full">
      <div className="h-60 w-full" role="img" aria-label="Tasks created and completed per week for the last 8 weeks">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: GRID }} tick={{ fill: AXIS_TEXT, fontSize: 12 }} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} tick={{ fill: AXIS_TEXT, fontSize: 12 }} />
            <Tooltip
              cursor={{ stroke: "#94A3B8", strokeDasharray: "4 4" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as TrendPoint & { label: string };
                return (
                  <TooltipBox
                    title={`Week of ${p.label}`}
                    rows={[
                      { color: CREATED, label: "Created", value: p.created },
                      {
                        color: COMPLETED,
                        label: "Completed",
                        value: p.completed,
                      },
                    ]}
                  />
                );
              }}
            />
            <Line
              type="monotone"
              dataKey="created"
              name="Created"
              stroke={CREATED}
              strokeWidth={2}
              dot={{ r: 4, fill: CREATED, stroke: SURFACE, strokeWidth: 2 }}
              activeDot={{ r: 6, stroke: SURFACE, strokeWidth: 2 }}
            />
            <Line
              type="monotone"
              dataKey="completed"
              name="Completed"
              stroke={COMPLETED}
              strokeWidth={2}
              dot={{ r: 4, fill: COMPLETED, stroke: SURFACE, strokeWidth: 2 }}
              activeDot={{ r: 6, stroke: SURFACE, strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <SeriesLegend
        line
        items={[
          { label: "Created", color: CREATED },
          { label: "Completed", color: COMPLETED },
        ]}
      />
    </div>
  );
}
