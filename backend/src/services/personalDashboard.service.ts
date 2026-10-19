/**
 * Dashboards for people outside the office view:
 * - employees: their own tasks, hours and what is coming up;
 * - clients (portal): work delivered to them, content mix, upcoming posts and ad results.
 * Client figures only include what the portal already shows (approved/published creatives, no spend).
 */
import { prisma } from "../db/prisma";
import type { TaskStatus } from "../generated/prisma/enums";
import type { AuthUser } from "../types/express";
import { AppError } from "../utils/AppError";
import { addDays, toDateString, todayUtc } from "../utils/dates";
import { listRange } from "./calendar.service";
import { PORTAL_STATUSES } from "./file.service";
import { planFor } from "./pdf/contentCalendarPdf";

const OPEN: TaskStatus[] = ["TODO", "IN_PROGRESS", "IN_REVIEW"];
const hours = (minutes: number) => Math.round((minutes / 60) * 100) / 100;

function monthStart(date: Date, offset = 0) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1));
}

const periodOf = (d: Date) => d.toISOString().slice(0, 7);

/** Monday (UTC) of the week containing `date`. */
function weekStart(date: Date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  return addDays(d, -((d.getUTCDay() + 6) % 7));
}

/** Last `count` months as YYYY-MM, oldest first. */
function lastMonths(today: Date, count: number) {
  return Array.from({ length: count }, (_, i) => periodOf(monthStart(today, i - count + 1)));
}

// ---------------------------------------------------------------------------
// Employee
// ---------------------------------------------------------------------------

export async function employeeDashboard(user: AuthUser) {
  const employeeId = user.employeeId;
  if (!employeeId) throw AppError.forbidden("Your login is not linked to an employee record");
  const today = todayUtc();
  const thisMonth = monthStart(today);
  const lastMonth = monthStart(today, -1);
  const dailyFrom = addDays(today, -13);
  const trendFrom = addDays(weekStart(today), -7 * 7);
  const mine = { assigneeId: employeeId };

  const [byStatus, overdue, dueThisWeek, doneThisMonth, doneLastMonth, logs, lastMonthMinutes, doneTrend, myTasks, events, pendingRequests, employee] = await Promise.all([
    prisma.task.groupBy({ by: ["status"], where: { ...mine, status: { in: OPEN } }, _count: { _all: true } }),
    prisma.task.count({ where: { ...mine, status: { in: OPEN }, dueDate: { lt: today } } }),
    prisma.task.count({ where: { ...mine, status: { in: OPEN }, dueDate: { gte: today, lte: addDays(today, 6) } } }),
    prisma.task.count({ where: { ...mine, status: "DONE", completedAt: { gte: thisMonth } } }),
    prisma.task.count({ where: { ...mine, status: "DONE", completedAt: { gte: lastMonth, lt: thisMonth } } }),
    prisma.workLog.findMany({
      where: { employeeId, workDate: { gte: trendFrom < thisMonth ? trendFrom : thisMonth } },
      select: { workDate: true, minutes: true, taskType: true, client: { select: { id: true, name: true } } },
    }),
    prisma.workLog.aggregate({ where: { employeeId, workDate: { gte: lastMonth, lt: thisMonth } }, _sum: { minutes: true } }),
    prisma.task.findMany({ where: { ...mine, status: "DONE", completedAt: { gte: trendFrom } }, select: { completedAt: true } }),
    prisma.task.findMany({
      where: { ...mine, status: { in: OPEN }, OR: [{ dueDate: { lte: addDays(today, 14) } }, { dueDate: null }] },
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { priority: "desc" }],
      take: 8,
      select: { id: true, title: true, status: true, priority: true, dueDate: true, client: { select: { name: true } } },
    }),
    listRange(user, { from: today.toISOString(), to: addDays(today, 8).toISOString(), mine: "true", sources: ["EVENT"], types: undefined }),
    prisma.approvalRequest.count({ where: { requestedById: user.id, status: "PENDING" } }),
    prisma.employee.findUnique({ where: { id: employeeId }, select: { fullName: true, designation: true } }),
  ]);

  const count = (s: TaskStatus) => byStatus.find((r) => r.status === s)?._count._all ?? 0;

  // Hours per day for the last 14 days.
  const daily = Array.from({ length: 14 }, (_, i) => ({ date: toDateString(addDays(dailyFrom, i)), hours: 0 }));
  for (const l of logs) {
    const day = daily.find((d) => d.date === toDateString(l.workDate));
    if (day) day.hours = hours(day.hours * 60 + l.minutes);
  }

  // This month: by client and by kind of work.
  const monthLogs = logs.filter((l) => l.workDate >= thisMonth);
  const byClient = new Map<string, { name: string; minutes: number }>();
  const byType = new Map<string, number>();
  for (const l of monthLogs) {
    const key = l.client?.id ?? "internal";
    const entry = byClient.get(key) ?? { name: l.client?.name ?? "Internal work", minutes: 0 };
    entry.minutes += l.minutes;
    byClient.set(key, entry);
    byType.set(l.taskType, (byType.get(l.taskType) ?? 0) + l.minutes);
  }

  // Weekly: tasks completed and hours logged.
  const weeks = Array.from({ length: 8 }, (_, i) => ({ week: toDateString(addDays(trendFrom, i * 7)), completed: 0, hours: 0 }));
  const weekOf = (d: Date) => weeks.find((w) => w.week === toDateString(weekStart(d)));
  for (const t of doneTrend) {
    const w = t.completedAt && weekOf(t.completedAt);
    if (w) w.completed += 1;
  }
  for (const l of logs) {
    const w = l.workDate >= trendFrom ? weekOf(l.workDate) : undefined;
    if (w) w.hours = hours(w.hours * 60 + l.minutes);
  }

  const monthMinutes = monthLogs.reduce((s, l) => s + l.minutes, 0);
  return {
    employee: { name: employee?.fullName ?? user.name, designation: employee?.designation ?? null },
    tasks: {
      todo: count("TODO"),
      inProgress: count("IN_PROGRESS"),
      inReview: count("IN_REVIEW"),
      open: count("TODO") + count("IN_PROGRESS") + count("IN_REVIEW"),
      overdue,
      dueThisWeek,
      doneThisMonth,
      doneLastMonth,
    },
    hours: {
      thisMonth: hours(monthMinutes),
      lastMonth: hours(lastMonthMinutes._sum.minutes ?? 0),
      daysLoggedThisMonth: new Set(monthLogs.map((l) => toDateString(l.workDate))).size,
      daily,
      byClient: [...byClient.values()].sort((a, b) => b.minutes - a.minutes).map((c) => ({ name: c.name, hours: hours(c.minutes) })),
      byType: [...byType.entries()].sort((a, b) => b[1] - a[1]).map(([type, minutes]) => ({ type, hours: hours(minutes) })),
    },
    weeks,
    myTasks: myTasks.map((t) => ({ ...t, overdue: Boolean(t.dueDate && t.dueDate < today) })),
    upcomingEvents: events.slice(0, 6).map(({ id, title, start, allDay, eventType, client }) => ({ id, title, start, allDay, eventType, client })),
    pendingRequests,
  };
}

// ---------------------------------------------------------------------------
// Client portal
// ---------------------------------------------------------------------------

export async function clientDashboard(clientId: string) {
  const today = todayUtc();
  const months = lastMonths(today, 6);
  const from = monthStart(today, -5);
  const visible = { clientId, status: { in: [...PORTAL_STATUSES] } };

  const [client, byStatus, recentForTrend, byType, byPlatform, campaigns, latestCalendar, recent, thisMonthPlan, nextMonthPlan] = await Promise.all([
    prisma.client.findUnique({ where: { id: clientId }, select: { name: true } }),
    prisma.creativeAsset.groupBy({ by: ["status"], where: visible, _count: { _all: true } }),
    prisma.creativeAsset.findMany({ where: { ...visible, createdAt: { gte: from } }, select: { createdAt: true, contentType: true } }),
    prisma.creativeAsset.groupBy({ by: ["contentType"], where: visible, _count: { _all: true } }),
    prisma.creativeAsset.groupBy({ by: ["platform"], where: visible, _count: { _all: true } }),
    prisma.adCampaign.findMany({
      where: { clientId, status: { not: "CANCELLED" } },
      select: { status: true, startDate: true, impressions: true, reach: true, clicks: true, results: true },
    }),
    prisma.contentCalendar.findFirst({ where: { clientId, sharedWithClient: true }, orderBy: [{ period: "desc" }, { createdAt: "desc" }], select: { id: true, title: true, period: true } }),
    prisma.creativeAsset.findMany({
      where: visible,
      orderBy: { createdAt: "desc" },
      take: 4,
      select: {
        id: true,
        title: true,
        contentType: true,
        platform: true,
        status: true,
        createdAt: true,
        files: { where: { mimeType: { startsWith: "image/" } }, take: 1, select: { id: true } },
      },
    }),
    planFor(clientId, periodOf(today)),
    planFor(clientId, periodOf(monthStart(today, 1))),
  ]);
  if (!client) throw AppError.notFound("Client");

  const published = byStatus.find((s) => s.status === "PUBLISHED")?._count._all ?? 0;
  const approved = byStatus.find((s) => s.status === "APPROVED")?._count._all ?? 0;

  // Creatives delivered per month, split by type.
  const types = [...new Set(recentForTrend.map((c) => c.contentType))];
  const delivered = months.map((period) => {
    const row: Record<string, string | number> = { period };
    for (const t of types) row[t] = recentForTrend.filter((c) => periodOf(c.createdAt) === period && c.contentType === t).length;
    return row;
  });

  const adMonths = months.map((period) => {
    const inMonth = campaigns.filter((c) => periodOf(c.startDate) === period);
    return { period, impressions: inMonth.reduce((s, c) => s + c.impressions, 0), clicks: inMonth.reduce((s, c) => s + c.clicks, 0) };
  });

  const todayKey = toDateString(today);
  return {
    client: { name: client.name },
    creatives: {
      delivered: published + approved,
      published,
      readyToPublish: approved,
      thisMonth: recentForTrend.filter((c) => periodOf(c.createdAt) === periodOf(today)).length,
      perMonth: delivered,
      types,
      byType: byType.map((t) => ({ type: t.contentType, count: t._count._all })).sort((a, b) => b.count - a.count),
      byPlatform: byPlatform.map((p) => ({ platform: p.platform, count: p._count._all })).sort((a, b) => b.count - a.count),
      recent: recent.map(({ files, ...c }) => ({ ...c, thumbnailId: files[0]?.id ?? null })),
    },
    ads: {
      active: campaigns.filter((c) => c.status === "ACTIVE").length,
      total: campaigns.length,
      impressions: campaigns.reduce((s, c) => s + c.impressions, 0),
      reach: campaigns.reduce((s, c) => s + c.reach, 0),
      clicks: campaigns.reduce((s, c) => s + c.clicks, 0),
      results: campaigns.reduce((s, c) => s + c.results, 0),
      perMonth: adMonths,
    },
    upcoming: [...thisMonthPlan, ...nextMonthPlan].filter((e) => e.date >= todayKey).slice(0, 8),
    latestCalendar,
  };
}
