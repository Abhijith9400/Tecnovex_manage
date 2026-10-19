/**
 * Cash-based dashboard and reports. Client collections come only from recorded payments (never from
 * invoice totals), so nothing is counted twice. These are management reports, not audited statements.
 */
import { prisma, type Prisma } from "../db/prisma";
import { formatPeriod, monthStart, periodLabel, todayUtc } from "../utils/dates";
import { money, sum } from "../utils/money";
import { refreshOverdue } from "./invoice.service";
import { adsReport, auditReport, boostedCreativesReport, expenseDetails, workReport } from "./reportExtras.service";

export interface DateRange {
  from: Date;
  to: Date;
}

export const CASH_BASIS_NOTE =
  "Cash basis: amounts are counted on the date money was received or paid. Invoices raised but not yet paid are not income. This is a management report, not an audited accounting statement.";

/** Defaults to the current calendar month. */
export function resolveRange(from?: Date, to?: Date): DateRange {
  const today = todayUtc();
  return {
    from: from ?? monthStart(today.getUTCFullYear(), today.getUTCMonth() + 1),
    to: to ?? new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0)),
  };
}

const dec = (value: Prisma.Decimal | null | undefined) => money(value ?? 0);

async function totalsFor(range: DateRange) {
  const [collections, otherIncome, expenses, payroll, adjustments, invoiced] = await Promise.all([
    prisma.payment.aggregate({ where: { status: "RECORDED", paymentDate: { gte: range.from, lte: range.to } }, _sum: { amount: true } }),
    prisma.incomeEntry.aggregate({ where: { voidedAt: null, incomeDate: { gte: range.from, lte: range.to } }, _sum: { amount: true } }),
    prisma.expense.aggregate({ where: { voidedAt: null, expenseDate: { gte: range.from, lte: range.to } }, _sum: { amount: true } }),
    prisma.payrollRecord.aggregate({ where: { status: "PAID", paidAt: { gte: range.from, lte: range.to } }, _sum: { netPay: true } }),
    prisma.payrollAdjustment.aggregate({ where: { paidAt: { gte: range.from, lte: range.to } }, _sum: { amount: true } }),
    prisma.invoice.aggregate({ where: { status: { notIn: ["DRAFT", "CANCELLED"] }, issueDate: { gte: range.from, lte: range.to } }, _sum: { total: true } }),
  ]);
  const payrollPaid = dec(payroll._sum.netPay).plus(dec(adjustments._sum.amount));
  const inflow = dec(collections._sum.amount).plus(dec(otherIncome._sum.amount));
  const outflow = dec(expenses._sum.amount).plus(payrollPaid);
  return {
    collections: dec(collections._sum.amount).toFixed(2),
    otherIncome: dec(otherIncome._sum.amount).toFixed(2),
    expenses: dec(expenses._sum.amount).toFixed(2),
    payroll: payrollPaid.toFixed(2),
    totalInflow: inflow.toFixed(2),
    totalOutflow: outflow.toFixed(2),
    netCashMovement: inflow.minus(outflow).toFixed(2),
    invoiced: dec(invoiced._sum.total).toFixed(2),
  };
}

/** Month buckets between two dates (inclusive). */
function monthsBetween(from: Date, to: Date) {
  const months: { year: number; month: number }[] = [];
  let y = from.getUTCFullYear();
  let m = from.getUTCMonth() + 1;
  while (y < to.getUTCFullYear() || (y === to.getUTCFullYear() && m <= to.getUTCMonth() + 1)) {
    months.push({ year: y, month: m });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    if (months.length > 60) break;
  }
  return months;
}

type MonthRow = { period: string; total: Prisma.Decimal | null };

async function monthlyTotals(range: DateRange) {
  const [payments, income, expenses, payroll, adjustments, invoiced] = await Promise.all([
    prisma.$queryRaw<MonthRow[]>`SELECT to_char("paymentDate", 'YYYY-MM') AS period, SUM(amount) AS total FROM "Payment" WHERE status = 'RECORDED' AND "paymentDate" BETWEEN ${range.from} AND ${range.to} GROUP BY 1`,
    prisma.$queryRaw<MonthRow[]>`SELECT to_char("incomeDate", 'YYYY-MM') AS period, SUM(amount) AS total FROM "IncomeEntry" WHERE "voidedAt" IS NULL AND "incomeDate" BETWEEN ${range.from} AND ${range.to} GROUP BY 1`,
    prisma.$queryRaw<MonthRow[]>`SELECT to_char("expenseDate", 'YYYY-MM') AS period, SUM(amount) AS total FROM "Expense" WHERE "voidedAt" IS NULL AND "expenseDate" BETWEEN ${range.from} AND ${range.to} GROUP BY 1`,
    prisma.$queryRaw<MonthRow[]>`SELECT to_char("paidAt", 'YYYY-MM') AS period, SUM("netPay") AS total FROM "PayrollRecord" WHERE status = 'PAID' AND "paidAt" BETWEEN ${range.from} AND ${range.to} GROUP BY 1`,
    prisma.$queryRaw<MonthRow[]>`SELECT to_char("paidAt", 'YYYY-MM') AS period, SUM(amount) AS total FROM "PayrollAdjustment" WHERE "paidAt" BETWEEN ${range.from} AND ${range.to} GROUP BY 1`,
    prisma.$queryRaw<MonthRow[]>`SELECT to_char("issueDate", 'YYYY-MM') AS period, SUM(total) AS total FROM "Invoice" WHERE status NOT IN ('DRAFT', 'CANCELLED') AND "issueDate" BETWEEN ${range.from} AND ${range.to} GROUP BY 1`,
  ]);
  const lookup = (rows: MonthRow[]) => new Map(rows.map((r) => [r.period, dec(r.total)]));
  const [p, i, e, pr, adj, inv] = [payments, income, expenses, payroll, adjustments, invoiced].map(lookup);
  return monthsBetween(range.from, range.to).map(({ year, month }) => {
    const key = formatPeriod(year, month);
    const collections = p.get(key) ?? money(0);
    const otherIncome = i.get(key) ?? money(0);
    const expense = e.get(key) ?? money(0);
    const payrollPaid = (pr.get(key) ?? money(0)).plus(adj.get(key) ?? money(0));
    return {
      period: key,
      label: periodLabel(year, month),
      collections: collections.toFixed(2),
      otherIncome: otherIncome.toFixed(2),
      expenses: expense.toFixed(2),
      payroll: payrollPaid.toFixed(2),
      netCashMovement: collections.plus(otherIncome).minus(expense).minus(payrollPaid).toFixed(2),
      invoiced: (inv.get(key) ?? money(0)).toFixed(2),
    };
  });
}

async function outstandingSummary() {
  await refreshOverdue();
  const open = await prisma.invoice.findMany({
    where: { status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] } },
    select: { total: true, amountPaid: true, status: true },
  });
  const overdue = open.filter((i) => i.status === "OVERDUE");
  return {
    outstanding: sum(open.map((i) => money(i.total).minus(i.amountPaid))).toFixed(2),
    openCount: open.length,
    overdue: sum(overdue.map((i) => money(i.total).minus(i.amountPaid))).toFixed(2),
    overdueCount: overdue.length,
  };
}

export async function dashboard(range: DateRange) {
  const today = todayUtc();
  const chartFrom = monthStart(range.to.getUTCFullYear(), range.to.getUTCMonth() + 1);
  chartFrom.setUTCMonth(chartFrom.getUTCMonth() - 5);

  const [totals, outstanding, monthly, recentPayments, recentExpenses, upcoming] = await Promise.all([
    totalsFor(range),
    outstandingSummary(),
    monthlyTotals({ from: chartFrom, to: range.to }),
    prisma.payment.findMany({
      where: { status: "RECORDED" },
      orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }],
      take: 6,
      select: { id: true, receiptNumber: true, paymentDate: true, amount: true, method: true, client: { select: { name: true } }, invoice: { select: { id: true, invoiceNumber: true } } },
    }),
    prisma.expense.findMany({
      where: { voidedAt: null },
      orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }],
      take: 6,
      select: { id: true, title: true, expenseDate: true, amount: true, vendor: true, category: { select: { name: true } } },
    }),
    prisma.invoice.findMany({
      where: { status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] } },
      orderBy: { dueDate: "asc" },
      take: 8,
      select: { id: true, invoiceNumber: true, dueDate: true, total: true, amountPaid: true, status: true, client: { select: { name: true } } },
    }),
  ]);

  return {
    range: { from: range.from, to: range.to },
    totals,
    outstanding,
    monthly,
    recentPayments,
    recentExpenses,
    upcomingDue: upcoming.map((i) => ({
      ...i,
      balanceDue: money(i.total).minus(i.amountPaid).toFixed(2),
      daysToDue: Math.round((i.dueDate.getTime() - today.getTime()) / 86_400_000),
    })),
    note: CASH_BASIS_NOTE,
  };
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export type ColumnType = "text" | "money" | "number" | "date";

export interface ReportResult {
  title: string;
  note: string;
  columns: { key: string; label: string; type: ColumnType }[];
  rows: Record<string, string | number | Date | null>[];
  totals?: Record<string, string | number>;
}

function totalsRow(rows: ReportResult["rows"], keys: string[], labelKey: string): Record<string, string> {
  const result: Record<string, string> = { [labelKey]: "Total" };
  for (const key of keys) result[key] = sum(rows.map((r) => String(r[key] ?? 0))).toFixed(2);
  return result;
}

export interface ReportFilters {
  clientId?: string;
  employeeId?: string;
  entityType?: string;
  action?: string;
}

/** Report types per category. The category decides who may run the report. */
export const REPORT_CATEGORIES = {
  money: ["monthly-summary", "collections", "other-income", "expenses-by-category", "expense-details", "outstanding-invoices", "client-wise", "payroll-totals"],
  ads: ["ads-campaigns", "ads-by-client", "ads-by-type", "ads-boosted-creatives"],
  work: ["work-by-employee", "work-by-client", "work-by-task", "work-log"],
  audit: ["audit-log"],
} as const;

export type ReportCategory = keyof typeof REPORT_CATEGORIES;

export function categoryOf(type: string): ReportCategory {
  for (const [category, types] of Object.entries(REPORT_CATEGORIES)) if ((types as readonly string[]).includes(type)) return category as ReportCategory;
  throw new Error(`Unknown report ${type}`);
}

export async function report(type: string, range: DateRange, filters: ReportFilters = {}): Promise<ReportResult> {
  switch (type) {
    case "expense-details":
      return expenseDetails(range);
    case "ads-boosted-creatives":
      return boostedCreativesReport(range, filters);
    case "ads-campaigns":
    case "ads-by-client":
    case "ads-by-type":
      return adsReport(type, range, filters);
    case "work-by-employee":
    case "work-by-client":
    case "work-by-task":
    case "work-log":
      return workReport(type, range, filters);
    case "audit-log":
      return auditReport(range, filters);
    case "monthly-summary": {
      const rows = await monthlyTotals(range);
      const keys = ["collections", "otherIncome", "expenses", "payroll", "netCashMovement", "invoiced"];
      return {
        title: "Monthly financial summary",
        note: `${CASH_BASIS_NOTE} "Invoiced" is shown for reference only and is not part of net cash movement.`,
        columns: [
          { key: "label", label: "Month", type: "text" },
          { key: "collections", label: "Client collections", type: "money" },
          { key: "otherIncome", label: "Other income", type: "money" },
          { key: "expenses", label: "Expenses", type: "money" },
          { key: "payroll", label: "Payroll paid", type: "money" },
          { key: "netCashMovement", label: "Net cash movement", type: "money" },
          { key: "invoiced", label: "Invoiced (reference)", type: "money" },
        ],
        rows,
        totals: totalsRow(rows, keys, "label"),
      };
    }
    case "collections": {
      const payments = await prisma.payment.findMany({
        where: { status: "RECORDED", paymentDate: { gte: range.from, lte: range.to } },
        orderBy: { paymentDate: "asc" },
        include: { client: { select: { name: true } }, invoice: { select: { invoiceNumber: true } } },
      });
      const rows = payments.map((p) => ({
        paymentDate: p.paymentDate,
        receiptNumber: p.receiptNumber,
        client: p.client.name,
        invoice: p.invoice?.invoiceNumber ?? "On account",
        method: p.method,
        reference: p.reference,
        amount: p.amount.toFixed(2),
      }));
      return {
        title: "Client collections",
        note: CASH_BASIS_NOTE,
        columns: [
          { key: "paymentDate", label: "Date", type: "date" },
          { key: "receiptNumber", label: "Receipt", type: "text" },
          { key: "client", label: "Client", type: "text" },
          { key: "invoice", label: "Invoice", type: "text" },
          { key: "method", label: "Method", type: "text" },
          { key: "reference", label: "Reference", type: "text" },
          { key: "amount", label: "Amount", type: "money" },
        ],
        rows,
        totals: totalsRow(rows, ["amount"], "paymentDate"),
      };
    }
    case "other-income": {
      const grouped = await prisma.incomeEntry.groupBy({
        by: ["categoryId"],
        where: { voidedAt: null, incomeDate: { gte: range.from, lte: range.to } },
        _sum: { amount: true },
        _count: true,
      });
      const categories = await prisma.category.findMany({ where: { id: { in: grouped.map((g) => g.categoryId) } } });
      const rows = grouped
        .map((g) => ({ category: categories.find((c) => c.id === g.categoryId)?.name ?? "-", entries: g._count, amount: dec(g._sum.amount).toFixed(2) }))
        .sort((a, b) => Number(b.amount) - Number(a.amount));
      return {
        title: "Other income by category",
        note: `${CASH_BASIS_NOTE} Excludes client invoice payments.`,
        columns: [
          { key: "category", label: "Category", type: "text" },
          { key: "entries", label: "Entries", type: "number" },
          { key: "amount", label: "Amount", type: "money" },
        ],
        rows,
        totals: totalsRow(rows, ["amount"], "category"),
      };
    }
    case "expenses-by-category": {
      const grouped = await prisma.expense.groupBy({
        by: ["categoryId"],
        where: { voidedAt: null, expenseDate: { gte: range.from, lte: range.to } },
        _sum: { amount: true },
        _count: true,
      });
      const categories = await prisma.category.findMany({ where: { id: { in: grouped.map((g) => g.categoryId) } } });
      const total = sum(grouped.map((g) => dec(g._sum.amount)));
      const rows = grouped
        .map((g) => ({
          category: categories.find((c) => c.id === g.categoryId)?.name ?? "-",
          entries: g._count,
          amount: dec(g._sum.amount).toFixed(2),
          share: total.isZero() ? "0.0%" : `${dec(g._sum.amount).dividedBy(total).times(100).toFixed(1)}%`,
        }))
        .sort((a, b) => Number(b.amount) - Number(a.amount));
      return {
        title: "Expenses by category",
        note: `${CASH_BASIS_NOTE} Payroll is reported separately.`,
        columns: [
          { key: "category", label: "Category", type: "text" },
          { key: "entries", label: "Entries", type: "number" },
          { key: "amount", label: "Amount", type: "money" },
          { key: "share", label: "Share", type: "text" },
        ],
        rows,
        totals: totalsRow(rows, ["amount"], "category"),
      };
    }
    case "outstanding-invoices": {
      await refreshOverdue();
      const today = todayUtc();
      const invoices = await prisma.invoice.findMany({
        where: { status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] } },
        orderBy: { dueDate: "asc" },
        include: { client: { select: { name: true } } },
      });
      const rows = invoices.map((i) => {
        const daysOverdue = Math.max(0, Math.round((today.getTime() - i.dueDate.getTime()) / 86_400_000));
        return {
          invoiceNumber: i.invoiceNumber,
          client: i.client.name,
          issueDate: i.issueDate,
          dueDate: i.dueDate,
          total: i.total.toFixed(2),
          paid: i.amountPaid.toFixed(2),
          balance: money(i.total).minus(i.amountPaid).toFixed(2),
          daysOverdue,
          ageing: daysOverdue === 0 ? "Not due" : daysOverdue <= 30 ? "1-30 days" : daysOverdue <= 60 ? "31-60 days" : daysOverdue <= 90 ? "61-90 days" : "90+ days",
        };
      });
      return {
        title: "Outstanding invoices (as of today)",
        note: "Open balances on issued invoices as of today. The date filter does not apply to this report.",
        columns: [
          { key: "invoiceNumber", label: "Invoice", type: "text" },
          { key: "client", label: "Client", type: "text" },
          { key: "issueDate", label: "Issued", type: "date" },
          { key: "dueDate", label: "Due", type: "date" },
          { key: "total", label: "Total", type: "money" },
          { key: "paid", label: "Paid", type: "money" },
          { key: "balance", label: "Balance", type: "money" },
          { key: "daysOverdue", label: "Days overdue", type: "number" },
          { key: "ageing", label: "Ageing", type: "text" },
        ],
        rows,
        totals: totalsRow(rows, ["total", "paid", "balance"], "invoiceNumber"),
      };
    }
    case "client-wise": {
      const [clients, invoiced, collected, open] = await Promise.all([
        prisma.client.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
        prisma.invoice.groupBy({ by: ["clientId"], where: { status: { notIn: ["DRAFT", "CANCELLED"] }, issueDate: { gte: range.from, lte: range.to } }, _sum: { total: true }, _count: true }),
        prisma.payment.groupBy({ by: ["clientId"], where: { status: "RECORDED", paymentDate: { gte: range.from, lte: range.to } }, _sum: { amount: true } }),
        prisma.invoice.findMany({ where: { status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] } }, select: { clientId: true, total: true, amountPaid: true } }),
      ]);
      const rows = clients
        .map((c) => {
          const inv = invoiced.find((i) => i.clientId === c.id);
          const col = collected.find((p) => p.clientId === c.id);
          const outstanding = sum(open.filter((o) => o.clientId === c.id).map((o) => money(o.total).minus(o.amountPaid)));
          return { client: c.name, invoices: inv?._count ?? 0, invoiced: dec(inv?._sum.total).toFixed(2), collected: dec(col?._sum.amount).toFixed(2), outstanding: outstanding.toFixed(2) };
        })
        .filter((r) => r.invoices > 0 || Number(r.collected) > 0 || Number(r.outstanding) > 0);
      return {
        title: "Client-wise billing and collections",
        note: "Invoiced = invoices issued in the period. Collected = payments received in the period (may relate to earlier invoices). Outstanding = current open balance.",
        columns: [
          { key: "client", label: "Client", type: "text" },
          { key: "invoices", label: "Invoices", type: "number" },
          { key: "invoiced", label: "Invoiced", type: "money" },
          { key: "collected", label: "Collected", type: "money" },
          { key: "outstanding", label: "Outstanding now", type: "money" },
        ],
        rows,
        totals: totalsRow(rows, ["invoiced", "collected", "outstanding"], "client"),
      };
    }
    case "payroll-totals": {
      const records = await prisma.payrollRecord.findMany({
        where: { periodYear: { gte: range.from.getUTCFullYear(), lte: range.to.getUTCFullYear() } },
        include: { adjustments: true },
      });
      const inRange = records.filter((r) => {
        const start = monthStart(r.periodYear, r.periodMonth);
        return start >= monthStart(range.from.getUTCFullYear(), range.from.getUTCMonth() + 1) && start <= range.to;
      });
      const byPeriod = new Map<string, typeof inRange>();
      for (const r of inRange) {
        const key = formatPeriod(r.periodYear, r.periodMonth);
        byPeriod.set(key, [...(byPeriod.get(key) ?? []), r]);
      }
      const rows = [...byPeriod.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([period, list]) => {
          const [year, month] = period.split("-").map(Number);
          return {
            period: periodLabel(year, month),
            employees: list.length,
            gross: sum(list.map((r) => r.grossEarnings)).toFixed(2),
            deductions: sum(list.map((r) => r.totalDeductions)).toFixed(2),
            net: sum(list.map((r) => r.netPay)).toFixed(2),
            adjustments: sum(list.flatMap((r) => r.adjustments.map((a) => a.amount))).toFixed(2),
            paid: sum(list.filter((r) => r.status === "PAID").map((r) => r.netPay)).toFixed(2),
            pending: sum(list.filter((r) => r.status !== "PAID").map((r) => r.netPay)).toFixed(2),
          };
        });
      return {
        title: "Payroll totals by pay period",
        note: "Grouped by salary month (not payment date). Deductions are as configured; verify statutory compliance independently.",
        columns: [
          { key: "period", label: "Pay period", type: "text" },
          { key: "employees", label: "Employees", type: "number" },
          { key: "gross", label: "Gross", type: "money" },
          { key: "deductions", label: "Deductions", type: "money" },
          { key: "net", label: "Net pay", type: "money" },
          { key: "adjustments", label: "Adjustments", type: "money" },
          { key: "paid", label: "Paid", type: "money" },
          { key: "pending", label: "Not yet paid", type: "money" },
        ],
        rows,
        totals: totalsRow(rows, ["gross", "deductions", "net", "adjustments", "paid", "pending"], "period"),
      };
    }
    default:
      throw new Error(`Unknown report ${type}`);
  }
}
