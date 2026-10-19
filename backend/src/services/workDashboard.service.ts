/**
 * Work side of the dashboard: tasks, team workload, creatives pipeline and upcoming deadlines.
 * Counts are "as of today" except `completedInPeriod`, which follows the selected date range.
 */
import { prisma } from "../db/prisma";
import type { TaskStatus } from "../generated/prisma/enums";
import { addDays, todayUtc, toDateString } from "../utils/dates";
import { listRange } from "./calendar.service";
import type { DateRange } from "./report.service";
import type { AuthUser } from "../types/express";

const OPEN: TaskStatus[] = ["TODO", "IN_PROGRESS", "IN_REVIEW"];
const TREND_WEEKS = 8;

/** Monday (UTC) of the week containing `date`. */
function weekStart(date: Date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  return addDays(d, -((d.getUTCDay() + 6) % 7));
}

export async function workDashboard(user: AuthUser, range: DateRange) {
  const today = todayUtc();
  const weekEnd = addDays(today, 6);
  const trendFrom = addDays(weekStart(today), -7 * (TREND_WEEKS - 1));
  const openWhere = { status: { in: OPEN } };

  const [
    byStatus,
    overdueCount,
    dueThisWeek,
    completedInPeriod,
    workload,
    overdueByAssignee,
    trendTasks,
    creativesByStatus,
    creativesPastDate,
    creativesDueSoon,
    pendingByClient,
    activeCampaigns,
    overdueTasks,
    upcoming,
  ] = await Promise.all([
    prisma.task.groupBy({ by: ["status"], where: openWhere, _count: { _all: true } }),
    prisma.task.count({ where: { ...openWhere, dueDate: { lt: today } } }),
    prisma.task.count({ where: { ...openWhere, dueDate: { gte: today, lte: weekEnd } } }),
    prisma.task.count({ where: { status: "DONE", completedAt: { gte: range.from, lt: addDays(range.to, 1) } } }),
    prisma.task.groupBy({ by: ["assigneeId", "status"], where: openWhere, _count: { _all: true } }),
    prisma.task.groupBy({ by: ["assigneeId"], where: { ...openWhere, dueDate: { lt: today } }, _count: { _all: true } }),
    prisma.task.findMany({
      where: { OR: [{ createdAt: { gte: trendFrom } }, { completedAt: { gte: trendFrom } }] },
      select: { createdAt: true, completedAt: true, status: true },
    }),
    prisma.creativeAsset.groupBy({ by: ["status"], where: { status: { not: "ARCHIVED" } }, _count: { _all: true } }),
    prisma.creativeAsset.count({ where: { status: { in: ["DRAFT", "APPROVED"] }, publishDate: { lt: today } } }),
    prisma.creativeAsset.count({ where: { status: { in: ["DRAFT", "APPROVED"] }, publishDate: { gte: today, lte: weekEnd } } }),
    prisma.creativeAsset.groupBy({
      by: ["clientId", "status"],
      where: { status: { in: ["DRAFT", "APPROVED"] } },
      _count: { _all: true },
    }),
    prisma.adCampaign.count({ where: { status: "ACTIVE" } }),
    prisma.task.findMany({
      where: { ...openWhere, dueDate: { lt: today } },
      orderBy: [{ dueDate: "asc" }, { priority: "desc" }],
      take: 8,
      select: { id: true, title: true, dueDate: true, priority: true, status: true, assignee: { select: { fullName: true } }, client: { select: { name: true } } },
    }),
    listRange(user, { from: toDateString(today), to: toDateString(addDays(today, 7)), types: undefined, sources: ["EVENT", "CREATIVE"] }),
  ]);

  const statusCount = (s: TaskStatus) => byStatus.find((r) => r.status === s)?._count._all ?? 0;

  // Workload per employee (open tasks split by status, plus how many are overdue).
  const employees = await prisma.employee.findMany({
    where: { id: { in: [...new Set(workload.map((w) => w.assigneeId))] } },
    select: { id: true, fullName: true },
  });
  const team = employees
    .map((e) => {
      const count = (s: TaskStatus) => workload.find((w) => w.assigneeId === e.id && w.status === s)?._count._all ?? 0;
      const todo = count("TODO");
      const inProgress = count("IN_PROGRESS");
      const inReview = count("IN_REVIEW");
      return {
        employeeId: e.id,
        name: e.fullName,
        todo,
        inProgress,
        inReview,
        total: todo + inProgress + inReview,
        overdue: overdueByAssignee.find((o) => o.assigneeId === e.id)?._count._all ?? 0,
      };
    })
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

  // Created vs completed per week.
  const weeks = Array.from({ length: TREND_WEEKS }, (_, i) => {
    const start = addDays(trendFrom, i * 7);
    return { week: toDateString(start), created: 0, completed: 0 };
  });
  const bucket = (date: Date | null) => (date && date >= trendFrom ? weeks.find((w) => w.week === toDateString(weekStart(date))) : undefined);
  for (const t of trendTasks) {
    const created = bucket(t.createdAt);
    if (created) created.created += 1;
    const completed = t.status === "DONE" ? bucket(t.completedAt) : undefined;
    if (completed) completed.completed += 1;
  }

  // Clients with the most creatives not yet published.
  const clientIds = [...new Set(pendingByClient.map((p) => p.clientId))];
  const clients = await prisma.client.findMany({ where: { id: { in: clientIds } }, select: { id: true, name: true } });
  const creativesByClient = clients
    .map((c) => {
      const count = (s: "DRAFT" | "APPROVED") => pendingByClient.find((p) => p.clientId === c.id && p.status === s)?._count._all ?? 0;
      return { clientId: c.id, name: c.name, draft: count("DRAFT"), approved: count("APPROVED") };
    })
    .sort((a, b) => b.draft + b.approved - (a.draft + a.approved) || a.name.localeCompare(b.name))
    .slice(0, 8);

  const creativeCount = (s: "DRAFT" | "APPROVED" | "PUBLISHED") => creativesByStatus.find((r) => r.status === s)?._count._all ?? 0;

  return {
    tasks: {
      todo: statusCount("TODO"),
      inProgress: statusCount("IN_PROGRESS"),
      inReview: statusCount("IN_REVIEW"),
      open: statusCount("TODO") + statusCount("IN_PROGRESS") + statusCount("IN_REVIEW"),
      overdue: overdueCount,
      dueThisWeek,
      completedInPeriod,
    },
    team,
    trend: weeks,
    creatives: {
      draft: creativeCount("DRAFT"),
      approved: creativeCount("APPROVED"),
      published: creativeCount("PUBLISHED"),
      pastPublishDate: creativesPastDate,
      dueThisWeek: creativesDueSoon,
      byClient: creativesByClient,
    },
    activeCampaigns,
    overdueTasks: overdueTasks.map((t) => ({ ...t, daysOverdue: Math.round((today.getTime() - (t.dueDate as Date).getTime()) / 86_400_000) })),
    upcoming: upcoming
      // Creatives already published are done; only show ones still to go out.
      .filter((i) => !(i.source === "CREATIVE" && i.meta?.endsWith("· published")))
      .sort((a, b) => a.start.localeCompare(b.start))
      .slice(0, 10)
      .map(({ id, source, title, start, allDay, eventType, color, client, href }) => ({ id, source, title, start, allDay, eventType, color, client, href })),
  };
}
