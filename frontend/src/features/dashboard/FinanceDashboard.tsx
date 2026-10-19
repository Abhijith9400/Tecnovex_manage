"use client";

import { AlertTriangle, ArrowDownRight, ArrowUpRight, Banknote, FileClock, PiggyBank, Receipt, Wallet } from "@/components/ui/icons";
import Link from "next/link";
import { Card, CardHeader, StatCard } from "@/components/ui/Card";
import { Alert, Badge, EmptyState, Spinner } from "@/components/ui/Feedback";
import { StatusBadge } from "@/components/ui/Misc";
import { CashFlowChart, type MonthPoint } from "./CashFlowChart";
import { api } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { humanize } from "@/lib/labels";
import { cn, formatCurrency, formatDate } from "@/lib/utils";

interface DashboardData {
  totals: {
    collections: string;
    otherIncome: string;
    expenses: string;
    payroll: string;
    totalInflow: string;
    totalOutflow: string;
    netCashMovement: string;
    invoiced: string;
  };
  outstanding: { outstanding: string; openCount: number; overdue: string; overdueCount: number };
  monthly: (MonthPoint & { invoiced: string })[];
  recentPayments: { id: string; receiptNumber: string; paymentDate: string; amount: string; method: string; client: { name: string }; invoice: { id: string; invoiceNumber: string | null } | null }[];
  recentExpenses: { id: string; title: string; expenseDate: string; amount: string; vendor: string | null; category: { name: string } }[];
  upcomingDue: { id: string; invoiceNumber: string; dueDate: string; balanceDue: string; status: string; daysToDue: number; client: { name: string } }[];
  note: string;
}

export function FinanceDashboard({ range }: { range: { from: string; to: string } }) {
  const dashboard = useAsync(() => api.get<DashboardData>("/dashboard", range), [range.from, range.to]);
  const d = dashboard.data;
  const net = d ? Number(d.totals.netCashMovement) : 0;

  return (
    <>
      {dashboard.error && <Alert>{dashboard.error}</Alert>}
      {!d ? (
        !dashboard.error && <Spinner />
      ) : (
        <div className={cn("space-y-6", dashboard.loading && "opacity-60")}>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Client collections" value={formatCurrency(d.totals.collections)} icon={Banknote} hint="Payments received" />
            <StatCard label="Other income" value={formatCurrency(d.totals.otherIncome)} icon={PiggyBank} hint="Excludes client payments" />
            <StatCard label="Expenses" value={formatCurrency(d.totals.expenses)} icon={Receipt} />
            <StatCard label="Payroll paid" value={formatCurrency(d.totals.payroll)} icon={Wallet} hint="Net pay + adjustments" />
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="p-4">
              <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
                Net cash movement
                {net >= 0 ? <ArrowUpRight className="size-4 text-success" aria-hidden /> : <ArrowDownRight className="size-4 text-danger" aria-hidden />}
              </p>
              <p className={cn("mt-2 text-2xl font-semibold", net < 0 ? "text-danger" : "text-ink")}>{formatCurrency(d.totals.netCashMovement)}</p>
              <p className="mt-1 text-xs text-muted">
                In {formatCurrency(d.totals.totalInflow)} − out {formatCurrency(d.totals.totalOutflow)}
              </p>
            </Card>
            <StatCard label="Outstanding invoices" value={formatCurrency(d.outstanding.outstanding)} icon={FileClock} hint={`${d.outstanding.openCount} open invoice(s), as of today`} />
            <StatCard
              label="Overdue"
              value={formatCurrency(d.outstanding.overdue)}
              icon={AlertTriangle}
              hint={`${d.outstanding.overdueCount} invoice(s) past due · Invoiced this period: ${formatCurrency(d.totals.invoiced)}`}
            />
          </div>
          <p className="text-xs text-muted">{d.note} Net cash movement is not accounting profit: it ignores unpaid invoices, accruals, depreciation and tax.</p>

          <Card>
            <CardHeader title="Monthly inflow and outflow" description="Last 6 months up to the end of the selected period (cash basis)." />
            <div className="p-4">
              <CashFlowChart months={d.monthly} />
            </div>
            <div className="overflow-x-auto border-t border-line">
              <table className="w-full text-sm">
                <caption className="sr-only">Monthly figures</caption>
                <thead>
                  <tr className="text-left text-xs font-medium text-muted uppercase">
                    <th className="px-4 py-2">Month</th>
                    <th className="px-4 py-2 text-right">Collections</th>
                    <th className="px-4 py-2 text-right">Other income</th>
                    <th className="px-4 py-2 text-right">Expenses</th>
                    <th className="px-4 py-2 text-right">Payroll</th>
                    <th className="px-4 py-2 text-right">Net</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {d.monthly.map((m) => (
                    <tr key={m.period}>
                      <td className="px-4 py-2">{m.label}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(m.collections)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(m.otherIncome)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(m.expenses)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(m.payroll)}</td>
                      <td className={cn("px-4 py-2 text-right font-medium tabular-nums", Number(m.netCashMovement) < 0 && "text-danger")}>{formatCurrency(m.netCashMovement)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="grid gap-6 xl:grid-cols-3">
            <Card>
              <CardHeader title="Upcoming & overdue invoices" action={<Link href="/invoices" className="text-xs text-accent hover:underline">All invoices</Link>} />
              {d.upcomingDue.length === 0 ? (
                <EmptyState title="Nothing outstanding" />
              ) : (
                <ul className="divide-y divide-line">
                  {d.upcomingDue.map((i) => (
                    <li key={i.id}>
                      <Link href={`/invoices/${i.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-page">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{i.client.name}</p>
                          <p className="text-xs text-muted">
                            {i.invoiceNumber} · due {formatDate(i.dueDate)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium tabular-nums">{formatCurrency(i.balanceDue)}</p>
                          {i.daysToDue < 0 ? <StatusBadge status="OVERDUE" /> : <Badge tone={i.daysToDue <= 7 ? "warning" : "neutral"}>in {i.daysToDue}d</Badge>}
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card>
              <CardHeader title="Recent payments" action={<Link href="/payments" className="text-xs text-accent hover:underline">All payments</Link>} />
              {d.recentPayments.length === 0 ? (
                <EmptyState title="No payments yet" />
              ) : (
                <ul className="divide-y divide-line">
                  {d.recentPayments.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{p.client.name}</p>
                        <p className="text-xs text-muted">
                          {formatDate(p.paymentDate)} · {humanize(p.method)} · {p.invoice?.invoiceNumber ?? "on account"}
                        </p>
                      </div>
                      <p className="text-sm font-medium text-success tabular-nums">{formatCurrency(p.amount)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card>
              <CardHeader title="Recent expenses" action={<Link href="/expenses" className="text-xs text-accent hover:underline">All expenses</Link>} />
              {d.recentExpenses.length === 0 ? (
                <EmptyState title="No expenses yet" />
              ) : (
                <ul className="divide-y divide-line">
                  {d.recentExpenses.map((e) => (
                    <li key={e.id} className="flex items-center justify-between gap-3 px-5 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{e.title}</p>
                        <p className="text-xs text-muted">
                          {formatDate(e.expenseDate)} · {e.category.name}
                          {e.vendor ? ` · ${e.vendor}` : ""}
                        </p>
                      </div>
                      <p className="text-sm font-medium tabular-nums">{formatCurrency(e.amount)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
