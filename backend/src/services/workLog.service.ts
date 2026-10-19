import type { Request } from "express";
import type { z } from "zod";
import { prisma, type Prisma } from "../db/prisma";
import type { AuthUser } from "../types/express";
import { AppError } from "../utils/AppError";
import type { workLogListQuery, workLogSchema } from "../validators/ads.validators";
import { audit, diff } from "./audit.service";

const include = {
  employee: { select: { id: true, fullName: true, employeeCode: true } },
  client: { select: { id: true, name: true } },
  createdBy: { select: { name: true } },
  task: { select: { id: true, title: true } },
} satisfies Prisma.WorkLogInclude;

const MANAGERS = ["ADMIN", "MANAGER"];

/** Admins and managers see and log everyone's time; employees only their own. */
function scopeFor(user: AuthUser): string | undefined {
  if (MANAGERS.includes(user.role)) return undefined;
  if (user.role === "EMPLOYEE" && user.employeeId) return user.employeeId;
  throw AppError.forbidden();
}

/** Adds a time-tracking event to the linked task's history (entityType "Task" in the audit log). */
function taskHistory(req: Request, taskId: string, clientId: string | null, action: string, summary: string, workTitle: string, tx: Prisma.TransactionClient) {
  return audit(req, { action, entityType: "Task", entityId: taskId, clientId, summary, changes: { work: workTitle } }, tx);
}

export function hoursOf(minutes: number) {
  return (minutes / 60).toFixed(2);
}

function shape<T extends { minutes: number }>(log: T) {
  return { ...log, hours: hoursOf(log.minutes) };
}

export function buildWhere(query: z.infer<typeof workLogListQuery>, employeeScope?: string): Prisma.WorkLogWhereInput {
  return {
    ...(employeeScope ? { employeeId: employeeScope } : query.employeeId ? { employeeId: query.employeeId } : {}),
    ...(query.clientId ? { clientId: query.clientId } : {}),
    ...(query.taskType ? { taskType: query.taskType } : {}),
    ...(query.from || query.to ? { workDate: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) } } : {}),
    ...(query.search
      ? { OR: [{ title: { contains: query.search, mode: "insensitive" } }, { description: { contains: query.search, mode: "insensitive" } }, { client: { name: { contains: query.search, mode: "insensitive" } } }] }
      : {}),
  };
}

export async function listLogs(user: AuthUser, query: z.infer<typeof workLogListQuery>, all = false) {
  const where = buildWhere(query, scopeFor(user));
  const [items, total, totals] = await prisma.$transaction([
    prisma.workLog.findMany({
      where,
      include,
      orderBy: [{ workDate: "desc" }, { createdAt: "desc" }],
      skip: all ? 0 : (query.page - 1) * query.pageSize,
      take: all ? 10_000 : query.pageSize,
    }),
    prisma.workLog.count({ where }),
    prisma.workLog.aggregate({ where, _sum: { minutes: true } }),
  ]);
  return { items: items.map(shape), total, totalHours: hoursOf(totals._sum.minutes ?? 0) };
}

async function resolveEmployee(user: AuthUser, requested: string | null) {
  const employeeId = MANAGERS.includes(user.role) ? requested : user.employeeId;
  if (!employeeId) throw AppError.badRequest(MANAGERS.includes(user.role) ? "Choose an employee" : "Your login is not linked to an employee record");
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee) throw AppError.badRequest("Employee not found");
  return employee;
}

/** Guards against obviously wrong entries: no more than 24 hours logged per person per day. */
async function assertDailyLimit(employeeId: string, workDate: Date, minutes: number, excludeId?: string) {
  const sum = await prisma.workLog.aggregate({ where: { employeeId, workDate, ...(excludeId ? { id: { not: excludeId } } : {}) }, _sum: { minutes: true } });
  if ((sum._sum.minutes ?? 0) + minutes > 24 * 60) throw AppError.badRequest("Total time logged for this person on this day would exceed 24 hours");
}

/** A work entry can only be linked to a task assigned to the same employee. */
async function assertTask(taskId: string | null, employeeId: string) {
  if (!taskId) return;
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { assigneeId: true } });
  if (!task || task.assigneeId !== employeeId) throw AppError.badRequest("That task is not assigned to this employee");
}

async function assertClient(clientId: string | null) {
  if (clientId && !(await prisma.client.findUnique({ where: { id: clientId } }))) throw AppError.badRequest("Client not found");
}

export async function createLog(req: Request, user: AuthUser, input: z.infer<typeof workLogSchema>) {
  const employee = await resolveEmployee(user, input.employeeId);
  await assertClient(input.clientId);
  await assertTask(input.taskId, employee.id);
  const minutes = Math.round(input.hours * 60);
  await assertDailyLimit(employee.id, input.workDate, minutes);
  const log = await prisma.$transaction(async (tx) => {
    const created = await tx.workLog.create({
      data: { employeeId: employee.id, clientId: input.clientId, taskId: input.taskId, workDate: input.workDate, minutes, taskType: input.taskType, title: input.title, description: input.description, createdById: user.id },
    });
    await audit(req, { action: "CREATE", entityType: "WorkLog", entityId: created.id, clientId: input.clientId, summary: `${employee.fullName} logged ${hoursOf(minutes)} h: ${input.title}` }, tx);
    if (input.taskId) {
      await taskHistory(req, input.taskId, input.clientId, "TIME_LOGGED", `Logged ${hoursOf(minutes)} h for ${employee.fullName} on ${input.workDate.toISOString().slice(0, 10)}`, input.title, tx);
    }
    return created;
  });
  return shape(await prisma.workLog.findUniqueOrThrow({ where: { id: log.id }, include }));
}

async function findOwned(user: AuthUser, id: string) {
  const log = await prisma.workLog.findUnique({ where: { id } });
  const scope = scopeFor(user);
  if (!log || (scope && log.employeeId !== scope)) throw AppError.notFound("Work log entry");
  return log;
}

export async function updateLog(req: Request, user: AuthUser, id: string, input: z.infer<typeof workLogSchema>) {
  const before = await findOwned(user, id);
  const employee = await resolveEmployee(user, input.employeeId ?? before.employeeId);
  await assertClient(input.clientId);
  await assertTask(input.taskId, employee.id);
  const minutes = Math.round(input.hours * 60);
  await assertDailyLimit(employee.id, input.workDate, minutes, id);
  const data = { employeeId: employee.id, clientId: input.clientId, taskId: input.taskId, workDate: input.workDate, minutes, taskType: input.taskType, title: input.title, description: input.description };
  await prisma.$transaction(async (tx) => {
    await tx.workLog.update({ where: { id }, data });
    await audit(req, { action: "UPDATE", entityType: "WorkLog", entityId: id, clientId: input.clientId, summary: `Work log "${input.title}" updated`, changes: diff(before, data) }, tx);
    if (before.taskId && before.taskId !== input.taskId) {
      await taskHistory(req, before.taskId, before.clientId, "TIME_REMOVED", `Time entry of ${hoursOf(before.minutes)} h moved off this task`, before.title, tx);
    }
    if (input.taskId) {
      const changed = before.taskId !== input.taskId ? `Logged ${hoursOf(minutes)} h for ${employee.fullName}` : `Time entry changed from ${hoursOf(before.minutes)} h to ${hoursOf(minutes)} h`;
      await taskHistory(req, input.taskId, input.clientId, "TIME_LOGGED", changed, input.title, tx);
    }
  });
  return shape(await prisma.workLog.findUniqueOrThrow({ where: { id }, include }));
}

export async function deleteLog(req: Request, user: AuthUser, id: string) {
  const log = await findOwned(user, id);
  await prisma.$transaction(async (tx) => {
    await tx.workLog.delete({ where: { id } });
    await audit(req, { action: "DELETE", entityType: "WorkLog", entityId: id, clientId: log.clientId, summary: `Work log "${log.title}" (${hoursOf(log.minutes)} h) deleted` }, tx);
    if (log.taskId) await taskHistory(req, log.taskId, log.clientId, "TIME_REMOVED", `Deleted a time entry of ${hoursOf(log.minutes)} h`, log.title, tx);
  });
}
