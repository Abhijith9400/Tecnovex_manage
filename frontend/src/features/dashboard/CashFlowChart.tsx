"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCurrency } from "@/lib/utils";

/** Validated pair (lightness, chroma, CVD separation, contrast vs white): brand-family blue + brand orange. */
const INFLOW = "#2563EB";
const OUTFLOW = "#EA580C";

export interface MonthPoint {
  period: string;
  label: string;
  collections: string;
  otherIncome: string;
  expenses: string;
  payroll: string;
  netCashMovement: string;
}

const compact = new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 });

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: MonthPoint & { inflow: number; outflow: number } }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-line bg-card px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold text-ink">{p.label}</p>
      <p className="flex justify-between gap-6 text-ink">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-sm" style={{ background: INFLOW }} /> Inflow
        </span>
        <span className="tabular-nums">{formatCurrency(p.inflow)}</span>
      </p>
      <p className="pl-3.5 text-muted">
        Collections {formatCurrency(p.collections)} · Other {formatCurrency(p.otherIncome)}
      </p>
      <p className="mt-1 flex justify-between gap-6 text-ink">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-sm" style={{ background: OUTFLOW }} /> Outflow
        </span>
        <span className="tabular-nums">{formatCurrency(p.outflow)}</span>
      </p>
      <p className="pl-3.5 text-muted">
        Expenses {formatCurrency(p.expenses)} · Payroll {formatCurrency(p.payroll)}
      </p>
      <p className="mt-1 flex justify-between gap-6 border-t border-line pt-1 font-semibold text-ink">
        <span>Net cash movement</span>
        <span className="tabular-nums">{formatCurrency(p.netCashMovement)}</span>
      </p>
    </div>
  );
}

/** Monthly inflow vs outflow (cash basis). Values come pre-computed from the API; summing here is display-only. */
export function CashFlowChart({ months }: { months: MonthPoint[] }) {
  const data = months.map((m) => ({
    ...m,
    short: m.label.replace(/ (\d{2})(\d{2})$/, " '$2"),
    inflow: Number(m.collections) + Number(m.otherIncome),
    outflow: Number(m.expenses) + Number(m.payroll),
  }));

  return (
    <div className="h-72 w-full" role="img" aria-label="Monthly inflow and outflow bar chart; figures are listed in the table below">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barGap={2} barCategoryGap="28%" margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#E2E8F0" />
          <XAxis dataKey="short" tickLine={false} axisLine={{ stroke: "#E2E8F0" }} tick={{ fill: "#64748B", fontSize: 12 }} />
          <YAxis tickLine={false} axisLine={false} width={56} tick={{ fill: "#64748B", fontSize: 12 }} tickFormatter={(v: number) => `₹${compact.format(v)}`} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: "#F1F5F9" }} />
          <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 12, color: "#0F172A", paddingTop: 8 }} />
          <Bar dataKey="inflow" name="Inflow (collections + other income)" fill={INFLOW} radius={[4, 4, 0, 0]} maxBarSize={28} />
          <Bar dataKey="outflow" name="Outflow (expenses + payroll)" fill={OUTFLOW} radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
