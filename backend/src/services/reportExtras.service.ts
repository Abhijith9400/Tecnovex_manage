/** Client ads, employee work, audit and spending-detail reports. Shapes match ReportResult in report.service. */
import { prisma } from "../db/prisma";
import { sum } from "../utils/money";
import { adMetrics, overlapWhere } from "./adCampaign.service";
import type { DateRange, ReportFilters, ReportResult } from "./report.service";
import { hoursOf } from "./workLog.service";

const CASH_NOTE = "Cash basis: amounts are counted on the date money was paid. This is a management report, not an audited accounting statement.";

function moneyTotals(rows: ReportResult["rows"], keys: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key of keys) result[key] = sum(rows.map((r) => String(r[key] ?? 0))).toFixed(2);
  return result;
}

/** Totals for integer count columns (impressions, clicks…), kept as whole numbers. */
function countTotals(rows: ReportResult["rows"], keys: string[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const key of keys) result[key] = rows.reduce((acc, r) => acc + Number(r[key] ?? 0), 0);
  return result;
}

export async function expenseDetails(range: DateRange): Promise<ReportResult> {
  const expenses = await prisma.expense.findMany({
    where: { voidedAt: null, expenseDate: { gte: range.from, lte: range.to } },
    include: { category: { select: { name: true } } },
    orderBy: { expenseDate: "asc" },
  });
  const rows = expenses.map((e) => ({
    expenseDate: e.expenseDate,
    title: e.title,
    category: e.category.name,
    vendor: e.vendor,
    method: e.paymentMethod,
    reference: e.reference,
    amount: e.amount.toFixed(2),
  }));
  return {
    title: "Spending details",
    note: `${CASH_NOTE} Every recorded expense in the period (voided entries excluded). Payroll is reported separately.`,
    columns: [
      { key: "expenseDate", label: "Date", type: "date" },
      { key: "title", label: "Expense", type: "text" },
      { key: "category", label: "Category", type: "text" },
      { key: "vendor", label: "Vendor / payee", type: "text" },
      { key: "method", label: "Method", type: "text" },
      { key: "reference", label: "Reference", type: "text" },
      { key: "amount", label: "Amount", type: "money" },
    ],
    rows,
    totals: { expenseDate: "Total", ...moneyTotals(rows, ["amount"]) },
  };
}

const AD_NOTE =
  "Campaigns that ran at any time in the selected period, with their full recorded spend and results (as entered from the ad platform). Cancelled campaigns are excluded. Agency-paid spend is not automatically added to Expenses.";

export async function adsReport(type: string, range: DateRange, filters: ReportFilters): Promise<ReportResult> {
  const campaigns = await prisma.adCampaign.findMany({
    where: { AND: [overlapWhere(range.from, range.to), filters.clientId ? { clientId: filters.clientId } : {}, { status: { not: "CANCELLED" } }] },
    include: { client: { select: { name: true } } },
    orderBy: [{ startDate: "asc" }],
  });
  const countKeys = ["impressions", "reach", "clicks", "results"];

  if (type === "ads-campaigns") {
    const rows = campaigns.map((c) => {
      const m = adMetrics(c);
      return {
        client: c.client.name,
        name: c.name,
        platform: c.platform,
        campaignType: c.campaignType,
        status: c.status,
        startDate: c.startDate,
        endDate: c.endDate,
        budget: c.budget?.toFixed(2) ?? null,
        spend: c.spend.toFixed(2),
        paidFrom: c.paidFrom,
        impressions: c.impressions,
        reach: c.reach,
        clicks: c.clicks,
        results: c.results,
        resultLabel: c.resultLabel,
        ctr: m.ctr ? `${m.ctr}%` : null,
        costPerResult: m.costPerResult,
      };
    });
    return {
      title: "Ad campaigns",
      note: AD_NOTE,
      columns: [
        { key: "client", label: "Client", type: "text" },
        { key: "name", label: "Campaign", type: "text" },
        { key: "platform", label: "Platform", type: "text" },
        { key: "campaignType", label: "Type", type: "text" },
        { key: "status", label: "Status", type: "text" },
        { key: "startDate", label: "Start", type: "date" },
        { key: "endDate", label: "End", type: "date" },
        { key: "budget", label: "Budget", type: "money" },
        { key: "spend", label: "Spend", type: "money" },
        { key: "paidFrom", label: "Paid from", type: "text" },
        { key: "impressions", label: "Impressions", type: "number" },
        { key: "reach", label: "Reach", type: "number" },
        { key: "clicks", label: "Clicks", type: "number" },
        { key: "results", label: "Results", type: "number" },
        { key: "resultLabel", label: "Result type", type: "text" },
        { key: "ctr", label: "CTR", type: "text" },
        { key: "costPerResult", label: "Cost / result", type: "money" },
      ],
      rows,
      totals: { client: "Total", ...moneyTotals(rows, ["budget", "spend"]), ...countTotals(rows, countKeys) },
    };
  }

  const byClient = type === "ads-by-client";
  const groups = new Map<string, typeof campaigns>();
  for (const c of campaigns) {
    const key = byClient ? c.client.name : c.campaignType;
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  const rows = [...groups.entries()]
    .map(([label, list]) => {
      const totals = {
        spend: sum(list.map((c) => c.spend)).toFixed(2),
        clientPaid: sum(list.filter((c) => c.paidFrom === "CLIENT_ACCOUNT").map((c) => c.spend)).toFixed(2),
        agencyPaid: sum(list.filter((c) => c.paidFrom === "AGENCY_PAID").map((c) => c.spend)).toFixed(2),
        impressions: list.reduce((a, c) => a + c.impressions, 0),
        reach: list.reduce((a, c) => a + c.reach, 0),
        clicks: list.reduce((a, c) => a + c.clicks, 0),
        results: list.reduce((a, c) => a + c.results, 0),
      };
      const m = adMetrics(totals);
      return { label, campaigns: list.length, ...totals, ctr: m.ctr ? `${m.ctr}%` : null, costPerResult: m.costPerResult };
    })
    .sort((a, b) => Number(b.spend) - Number(a.spend));

  return {
    title: byClient ? "Ad spend and results by client" : "Ad spend and results by campaign type",
    note: AD_NOTE,
    columns: [
      { key: "label", label: byClient ? "Client" : "Campaign type", type: "text" },
      { key: "campaigns", label: "Campaigns", type: "number" },
      { key: "spend", label: "Total spend", type: "money" },
      { key: "clientPaid", label: "From client account", type: "money" },
      { key: "agencyPaid", label: "Agency paid", type: "money" },
      { key: "impressions", label: "Impressions", type: "number" },
      { key: "reach", label: "Reach", type: "number" },
      { key: "clicks", label: "Clicks", type: "number" },
      { key: "results", label: "Results", type: "number" },
      { key: "ctr", label: "CTR", type: "text" },
      { key: "costPerResult", label: "Cost / result", type: "money" },
    ],
    rows,
    totals: { label: "Total", ...moneyTotals(rows, ["spend", "clientPaid", "agencyPaid"]), ...countTotals(rows, ["campaigns", ...countKeys]) },
  };
}

/** One row per boosted creative (or per post link when the post is not in the Creative Shelf). */
export async function boostedCreativesReport(range: DateRange, filters: ReportFilters): Promise<ReportResult> {
  const campaigns = await prisma.adCampaign.findMany({
    where: {
      AND: [
        overlapWhere(range.from, range.to),
        filters.clientId ? { clientId: filters.clientId } : {},
        { status: { not: "CANCELLED" } },
        { OR: [{ creativeId: { not: null } }, { postUrl: { not: null } }] },
      ],
    },
    include: { client: { select: { name: true } }, creative: { select: { id: true, title: true, contentType: true, campaign: true } } },
    orderBy: { startDate: "asc" },
  });

  const groups = new Map<string, typeof campaigns>();
  for (const c of campaigns) {
    const key = c.creativeId ?? `url:${c.postUrl}`;
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }

  const rows = [...groups.values()]
    .map((list) => {
      const first = list[0];
      const totals = {
        spend: sum(list.map((c) => c.spend)).toFixed(2),
        impressions: list.reduce((a, c) => a + c.impressions, 0),
        reach: list.reduce((a, c) => a + c.reach, 0),
        clicks: list.reduce((a, c) => a + c.clicks, 0),
        results: list.reduce((a, c) => a + c.results, 0),
      };
      const m = adMetrics(totals);
      const starts = list.map((c) => c.startDate.getTime());
      const ends = list.map((c) => (c.endDate ?? c.startDate).getTime());
      return {
        client: first.client.name,
        creative: first.creative?.title ?? "Post not in Creative Shelf",
        contentType: first.creative?.contentType ?? (first.campaignType === "REEL_BOOST" ? "REEL" : first.campaignType === "STORY_BOOST" ? "STORY" : "POST"),
        campaign: first.creative?.campaign ?? null,
        postUrl: [...new Set(list.map((c) => c.postUrl).filter(Boolean))].join(" ") || null,
        platforms: [...new Set(list.map((c) => c.platform))].join(", "),
        boosts: list.length,
        boostedFrom: new Date(Math.min(...starts)),
        boostedTo: list.some((c) => !c.endDate) ? null : new Date(Math.max(...ends)),
        ...totals,
        ctr: m.ctr ? `${m.ctr}%` : null,
        costPerResult: m.costPerResult,
        resultLabel: [...new Set(list.map((c) => c.resultLabel).filter(Boolean))].join(", ") || null,
      };
    })
    .sort((a, b) => Number(b.spend) - Number(a.spend));

  return {
    title: "Boosted posts & reels",
    note: `${AD_NOTE} Each row is one poster, reel, carousel or story with all of its boosts combined. Boosts without a linked creative or post link are not listed here.`,
    columns: [
      { key: "client", label: "Client", type: "text" },
      { key: "creative", label: "Boosted creative", type: "text" },
      { key: "contentType", label: "Type", type: "text" },
      { key: "campaign", label: "Campaign", type: "text" },
      { key: "platforms", label: "Platform", type: "text" },
      { key: "boosts", label: "Boosts", type: "number" },
      { key: "boostedFrom", label: "From", type: "date" },
      { key: "boostedTo", label: "To", type: "date" },
      { key: "spend", label: "Spend", type: "money" },
      { key: "impressions", label: "Impressions", type: "number" },
      { key: "reach", label: "Reach", type: "number" },
      { key: "clicks", label: "Clicks", type: "number" },
      { key: "results", label: "Results", type: "number" },
      { key: "resultLabel", label: "Result type", type: "text" },
      { key: "ctr", label: "CTR", type: "text" },
      { key: "costPerResult", label: "Cost / result", type: "money" },
      { key: "postUrl", label: "Post link", type: "text" },
    ],
    rows,
    totals: { client: "Total", ...moneyTotals(rows, ["spend"]), ...countTotals(rows, ["boosts", "impressions", "reach", "clicks", "results"]) },
  };
}

const WORK_NOTE = "Time entered in the Work Log for the selected period. Hours are as recorded by staff and are not verified attendance.";

export async function workReport(type: string, range: DateRange, filters: ReportFilters): Promise<ReportResult> {
  const logs = await prisma.workLog.findMany({
    where: {
      workDate: { gte: range.from, lte: range.to },
      ...(filters.employeeId ? { employeeId: filters.employeeId } : {}),
      ...(filters.clientId ? { clientId: filters.clientId } : {}),
    },
    include: { employee: { select: { fullName: true, employeeCode: true } }, client: { select: { name: true } } },
    orderBy: [{ workDate: "asc" }, { createdAt: "asc" }],
  });
  const totalMinutes = logs.reduce((a, l) => a + l.minutes, 0);

  if (type === "work-log") {
    const rows = logs.map((l) => ({
      workDate: l.workDate,
      employee: `${l.employee.fullName} (${l.employee.employeeCode})`,
      client: l.client?.name ?? "Internal",
      taskType: l.taskType,
      title: l.title,
      description: l.description,
      hours: hoursOf(l.minutes),
    }));
    return {
      title: "Work log – all entries",
      note: WORK_NOTE,
      columns: [
        { key: "workDate", label: "Date", type: "date" },
        { key: "employee", label: "Employee", type: "text" },
        { key: "client", label: "Client", type: "text" },
        { key: "taskType", label: "Task type", type: "text" },
        { key: "title", label: "Work done", type: "text" },
        { key: "description", label: "Details", type: "text" },
        { key: "hours", label: "Hours", type: "number" },
      ],
      rows,
      totals: { workDate: "Total", hours: hoursOf(totalMinutes) },
    };
  }

  const keyOf = (l: (typeof logs)[number]) =>
    type === "work-by-employee" ? `${l.employee.fullName} (${l.employee.employeeCode})` : type === "work-by-client" ? (l.client?.name ?? "Internal (no client)") : l.taskType;
  const groups = new Map<string, typeof logs>();
  for (const l of logs) groups.set(keyOf(l), [...(groups.get(keyOf(l)) ?? []), l]);

  const rows = [...groups.entries()]
    .map(([label, list]) => {
      const minutes = list.reduce((a, l) => a + l.minutes, 0);
      const byTask = new Map<string, number>();
      for (const l of list) byTask.set(l.taskType, (byTask.get(l.taskType) ?? 0) + l.minutes);
      return {
        label,
        entries: list.length,
        days: new Set(list.map((l) => l.workDate.toISOString().slice(0, 10))).size,
        hours: hoursOf(minutes),
        share: totalMinutes ? `${((minutes / totalMinutes) * 100).toFixed(1)}%` : "0.0%",
        people: new Set(list.map((l) => l.employeeId)).size,
        clients: new Set(list.map((l) => l.clientId ?? "internal")).size,
        topTask: [...byTask].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
        minutes,
      };
    })
    .sort((a, b) => b.minutes - a.minutes)
    .map(({ minutes: _minutes, ...row }) => row);

  const titles = {
    "work-by-employee": ["Work by employee", "Employee"],
    "work-by-client": ["Work by client", "Client"],
    "work-by-task": ["Work by task type", "Task type"],
  } as const;
  const [title, labelHeader] = titles[type as keyof typeof titles];
  const columns: ReportResult["columns"] = [
    { key: "label", label: labelHeader, type: "text" },
    { key: "entries", label: "Entries", type: "number" },
    { key: "days", label: "Days worked", type: "number" },
    { key: "hours", label: "Hours", type: "number" },
    { key: "share", label: "Share of time", type: "text" },
  ];
  if (type !== "work-by-employee") columns.push({ key: "people", label: "People", type: "number" });
  if (type !== "work-by-client") columns.push({ key: "clients", label: "Clients", type: "number" });
  if (type !== "work-by-task") columns.push({ key: "topTask", label: "Main task", type: "text" });
  return { title, note: WORK_NOTE, columns, rows, totals: { label: "Total", entries: logs.length, hours: hoursOf(totalMinutes), share: totalMinutes ? "100.0%" : "0.0%" } };
}

export async function auditReport(range: DateRange, filters: ReportFilters): Promise<ReportResult> {
  const end = new Date(range.to);
  end.setUTCDate(end.getUTCDate() + 1);
  const logs = await prisma.auditLog.findMany({
    where: {
      createdAt: { gte: range.from, lt: end },
      ...(filters.entityType ? { entityType: filters.entityType } : {}),
      ...(filters.action ? { action: filters.action } : {}),
      ...(filters.clientId ? { clientId: filters.clientId } : {}),
    },
    include: { user: { select: { name: true, email: true } }, client: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 5000,
  });
  const rows = logs.map((l) => ({
    createdAt: l.createdAt.toISOString().replace("T", " ").slice(0, 19),
    user: l.user ? `${l.user.name} (${l.user.email})` : "System",
    action: l.action,
    entityType: l.entityType,
    client: l.client?.name ?? null,
    summary: l.summary,
    ipAddress: l.ipAddress,
  }));
  return {
    title: "Audit trail",
    note: "Every recorded create, update, issue, void, payment, payroll, download and sign-in in the period (newest first, up to 5,000 rows; times in UTC). Audit entries cannot be edited or deleted from the app.",
    columns: [
      { key: "createdAt", label: "When (UTC)", type: "text" },
      { key: "user", label: "User", type: "text" },
      { key: "action", label: "Action", type: "text" },
      { key: "entityType", label: "Record type", type: "text" },
      { key: "client", label: "Client", type: "text" },
      { key: "summary", label: "Details", type: "text" },
      { key: "ipAddress", label: "IP address", type: "text" },
    ],
    rows,
  };
}

export async function auditFilterOptions() {
  const [entityTypes, actions] = await Promise.all([
    prisma.auditLog.findMany({ distinct: ["entityType"], select: { entityType: true }, orderBy: { entityType: "asc" } }),
    prisma.auditLog.findMany({ distinct: ["action"], select: { action: true }, orderBy: { action: "asc" } }),
  ]);
  return { entityTypes: entityTypes.map((e) => e.entityType), actions: actions.map((a) => a.action) };
}
