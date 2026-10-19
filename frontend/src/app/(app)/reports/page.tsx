"use client";

import { ClipboardList, type IconComponent, Megaphone, ShieldCheck, Wallet } from "@/components/ui/icons";
import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { FilterSelect, Toolbar } from "@/components/ui/DataTable";
import { Alert, EmptyState, Spinner } from "@/components/ui/Feedback";
import { CsvButton, DateRange } from "@/components/ui/Filters";
import { useAuth } from "@/features/auth/AuthProvider";
import { RequireRole } from "@/features/auth/RequireRole";
import { api } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { humanize } from "@/lib/labels";
import { roleGroups } from "@/lib/navigation";
import { useClientOptions } from "@/lib/options";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import type { Role } from "@/types/models";

interface ReportResult {
  title: string;
  note: string;
  columns: { key: string; label: string; type: "text" | "money" | "number" | "date" }[];
  rows: Record<string, string | number | null>[];
  totals?: Record<string, string | number>;
}

type CategoryKey = "money" | "ads" | "work" | "audit";
type FilterKey = "client" | "employee" | "audit";

const categories: { key: CategoryKey; label: string; description: string; icon: IconComponent; roles: Role[]; filters: FilterKey[]; reports: { value: string; label: string }[] }[] = [
  {
    key: "money",
    label: "Money",
    description: "Income, spending, collections and payroll (cash basis).",
    icon: Wallet,
    roles: ["ADMIN", "ACCOUNTANT", "MANAGER"],
    filters: [],
    reports: [
      { value: "monthly-summary", label: "Income & expense summary" },
      { value: "collections", label: "Client collections" },
      { value: "other-income", label: "Other income" },
      { value: "expenses-by-category", label: "Spending by category" },
      { value: "expense-details", label: "Spending details" },
      { value: "outstanding-invoices", label: "Outstanding invoices" },
      { value: "client-wise", label: "Client billing & collections" },
      { value: "payroll-totals", label: "Payroll totals" },
    ],
  },
  {
    key: "ads",
    label: "Client Ads",
    description: "Boosts and paid campaigns: spend, reach, clicks and results.",
    icon: Megaphone,
    roles: ["ADMIN", "ACCOUNTANT", "MANAGER"],
    filters: ["client"],
    reports: [
      { value: "ads-by-client", label: "Spend & results by client" },
      { value: "ads-boosted-creatives", label: "Boosted posts & reels" },
      { value: "ads-campaigns", label: "All campaigns" },
      { value: "ads-by-type", label: "By campaign type" },
    ],
  },
  {
    key: "work",
    label: "Employee Work",
    description: "Work done by each employee, for which client, and the time spent.",
    icon: ClipboardList,
    roles: ["ADMIN", "MANAGER"],
    filters: ["employee", "client"],
    reports: [
      { value: "work-by-employee", label: "Hours by employee" },
      { value: "work-by-client", label: "Hours by client" },
      { value: "work-by-task", label: "Hours by task type" },
      { value: "work-log", label: "Detailed work log" },
    ],
  },
  {
    key: "audit",
    label: "Audit",
    description: "Who created, changed, voided or downloaded what, and when.",
    icon: ShieldCheck,
    roles: ["ADMIN", "MANAGER"],
    filters: ["audit", "client"],
    reports: [{ value: "audit-log", label: "Audit trail" }],
  },
];

/** Start of the current Indian financial year (1 April) to today. */
function financialYearToDate() {
  const now = new Date();
  const startYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const pad = (n: number) => String(n).padStart(2, "0");
  return { from: `${startYear}-04-01`, to: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` };
}

/** One-click periods for month-end reporting. */
function presets() {
  const pad = (n: number) => String(n).padStart(2, "0");
  const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const now = new Date();
  const thisStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const thisEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const lastStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastEnd = new Date(now.getFullYear(), now.getMonth(), 0);
  return [
    { label: "This month", from: iso(thisStart), to: iso(thisEnd) },
    { label: "Last month", from: iso(lastStart), to: iso(lastEnd) },
    { label: "Financial year", ...financialYearToDate() },
  ];
}

const numberFormat = new Intl.NumberFormat("en-IN");

function cell(value: string | number | null | undefined, type: string) {
  if (value === null || value === undefined || value === "") return "—";
  if (type === "money") return formatCurrency(value);
  if (type === "date") return formatDate(String(value));
  if (typeof value === "string" && value.startsWith("http")) {
    return value.split(" ").map((url) => (
      <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="mr-2 text-accent hover:underline">
        Open
      </a>
    ));
  }
  if (type === "number" && typeof value === "number") return numberFormat.format(value);
  if (type === "text" && typeof value === "string" && /^[A-Z][A-Z_]+$/.test(value)) return humanize(value);
  return value;
}

const alignRight = (type: string) => type === "money" || type === "number";

export default function ReportsPage() {
  const { hasRole } = useAuth();
  const visible = categories.filter((c) => hasRole(c.roles));
  const [categoryKey, setCategoryKey] = useState<CategoryKey>(visible[0]?.key ?? "ads");
  const category = visible.find((c) => c.key === categoryKey) ?? visible[0];
  const [type, setType] = useState(category?.reports[0].value ?? "");
  const [range, setRange] = useState(financialYearToDate);
  const [filters, setFilters] = useState({ clientId: "", employeeId: "", entityType: "", action: "" });

  const clients = useClientOptions(true);
  const employees = useAsync(() => (category?.filters.includes("employee") ? api.get<{ id: string; fullName: string }[]>("/employees/options") : Promise.resolve(null)), [category?.key]);
  const auditOptions = useAsync(() => (category?.key === "audit" ? api.get<{ entityTypes: string[]; actions: string[] }>("/reports/audit-options") : Promise.resolve(null)), [category?.key]);

  const query = {
    ...range,
    clientId: category?.filters.includes("client") ? filters.clientId : "",
    employeeId: category?.filters.includes("employee") ? filters.employeeId : "",
    entityType: category?.key === "audit" ? filters.entityType : "",
    action: category?.key === "audit" ? filters.action : "",
  };
  const report = useAsync(() => (type ? api.get<ReportResult>(`/reports/${type}`, query) : Promise.resolve(undefined)), [type, JSON.stringify(query)]);
  const data = report.data;

  function chooseCategory(key: CategoryKey) {
    const next = visible.find((c) => c.key === key);
    if (!next) return;
    setCategoryKey(key);
    setType(next.reports[0].value);
  }

  if (!category) {
    return (
      <RequireRole roles={roleGroups.STAFF}>
        <EmptyState title="No reports available for your role" />
      </RequireRole>
    );
  }

  return (
    <RequireRole roles={roleGroups.STAFF}>
      <PageHeader title="Reports" description="Pick a category and report, set the period and filters, then export to CSV if needed." />

      {/* Categories */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {visible.map((c) => {
          const Icon = c.icon;
          const active = c.key === category.key;
          return (
            <button
              key={c.key}
              onClick={() => chooseCategory(c.key)}
              aria-pressed={active}
              className={cn(
                "flex items-start gap-3 rounded-xl border p-4 text-left transition-colors",
                active ? "border-accent bg-accent-soft ring-1 ring-accent" : "border-line bg-card hover:border-orange-200 hover:bg-accent-soft/50",
              )}
            >
              <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", active ? "bg-accent text-white" : "bg-page text-slate-500")}>
                <Icon className="size-[18px]" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-ink">{c.label}</span>
                <span className="mt-0.5 block text-xs text-muted">{c.description}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Reports within the category + filters */}
      <Card className="mb-4">
        <div className="flex flex-wrap gap-2 border-b border-line p-3" role="tablist" aria-label={`${category.label} reports`}>
          {category.reports.map((r) => (
            <button
              key={r.value}
              role="tab"
              aria-selected={type === r.value}
              onClick={() => setType(r.value)}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                type === r.value ? "bg-accent text-white" : "bg-page text-slate-600 hover:bg-accent-soft hover:text-ink",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
        <Toolbar>
          <div className="flex gap-1">
            {presets().map((p) => (
              <button
                key={p.label}
                onClick={() => setRange({ from: p.from, to: p.to })}
                className={cn(
                  "h-9 rounded-lg border px-2.5 text-xs font-medium",
                  range.from === p.from && range.to === p.to ? "border-accent bg-accent-soft text-accent-hover" : "border-line text-slate-600 hover:bg-page",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <DateRange from={range.from} to={range.to} onChange={setRange} />
          {category.filters.includes("client") && (
            <FilterSelect label="Client" value={filters.clientId} onChange={(v) => setFilters((f) => ({ ...f, clientId: v }))} options={(clients.data ?? []).map((c) => ({ value: c.id, label: c.name }))} />
          )}
          {category.filters.includes("employee") && (
            <FilterSelect
              label="Employee"
              value={filters.employeeId}
              onChange={(v) => setFilters((f) => ({ ...f, employeeId: v }))}
              options={(employees.data ?? []).map((e) => ({ value: e.id, label: e.fullName }))}
            />
          )}
          {category.filters.includes("audit") && (
            <>
              <FilterSelect
                label="Record type"
                value={filters.entityType}
                onChange={(v) => setFilters((f) => ({ ...f, entityType: v }))}
                options={(auditOptions.data?.entityTypes ?? []).map((t) => ({ value: t, label: t }))}
              />
              <FilterSelect label="Action" value={filters.action} onChange={(v) => setFilters((f) => ({ ...f, action: v }))} options={(auditOptions.data?.actions ?? []).map((a) => ({ value: a, label: humanize(a) }))} />
            </>
          )}
          <div className="sm:ml-auto">
            <CsvButton href={api.url(`/reports/${type}`, { ...query, format: "csv" })} />
          </div>
        </Toolbar>
      </Card>

      {report.error ? (
        <Alert>{report.error}</Alert>
      ) : !data ? (
        <Spinner />
      ) : (
        <Card className={cn(report.loading && "opacity-60")}>
          <CardHeader title={data.title} description={data.note} />
          {data.rows.length === 0 ? (
            <EmptyState title="No data for this period and filters" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line bg-page/60 text-left text-xs font-medium tracking-wide text-muted uppercase">
                    {data.columns.map((c) => (
                      <th key={c.key} className={cn("px-4 py-2.5 whitespace-nowrap", alignRight(c.type) && "text-right")}>
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.rows.map((row, index) => (
                    <tr key={index} className="hover:bg-page/60">
                      {data.columns.map((c, columnIndex) => (
                        <td
                          key={c.key}
                          className={cn(
                            "px-4 py-2.5 align-top",
                            columnIndex === 0 && "min-w-44 font-medium",
                            alignRight(c.type) && "text-right whitespace-nowrap tabular-nums",
                            c.type === "date" && "whitespace-nowrap",
                            c.key === "netCashMovement" && Number(row[c.key]) < 0 && "text-danger",
                            c.key === "summary" && "min-w-72",
                          )}
                        >
                          {cell(row[c.key], c.type)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                {data.totals && (
                  <tfoot>
                    <tr className="border-t-2 border-line bg-page font-semibold">
                      {data.columns.map((c) => (
                        <td key={c.key} className={cn("px-4 py-2.5 whitespace-nowrap", alignRight(c.type) && "text-right tabular-nums")}>
                          {data.totals?.[c.key] !== undefined ? cell(data.totals[c.key], c.type) : ""}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </Card>
      )}
    </RequireRole>
  );
}
