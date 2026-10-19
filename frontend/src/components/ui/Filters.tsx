"use client";

import { Download } from "@/components/ui/icons";
import { Button } from "./Button";

const dateClass = "h-9 rounded-lg border border-line bg-card px-2.5 text-sm focus:border-accent focus:outline-none";

export function DateRange({ from, to, onChange }: { from: string; to: string; onChange: (range: { from: string; to: string }) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <input type="date" value={from} onChange={(e) => onChange({ from: e.target.value, to })} aria-label="From date" className={dateClass} />
      <span className="text-xs text-muted">to</span>
      <input type="date" value={to} onChange={(e) => onChange({ from, to: e.target.value })} aria-label="To date" className={dateClass} />
    </div>
  );
}

export function MonthPicker({ value, onChange, label = "Month" }: { value: string; onChange: (value: string) => void; label?: string }) {
  return <input type="month" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} className={dateClass} />;
}

export function CsvButton({ href }: { href: string }) {
  return (
    <a href={href}>
      <Button variant="secondary" size="sm">
        <Download className="size-4" /> CSV
      </Button>
    </a>
  );
}

/** First and last day of the current month as YYYY-MM-DD. */
export function currentMonthRange() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return { from: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`, to: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(last)}` };
}
