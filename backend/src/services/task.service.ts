import type { Request } from "express";
import type { z } from "zod";
import { prisma, type Prisma, type Tx } from "../db/prisma";
import type { TaskStatus } from "../generated/prisma/enums";
import type { AuthUser } from "../types/express";
import { AppError } from "../utils/AppError";
import { todayUtc } from "../utils/dates";
import type { taskListQuery, taskSchema } from "../validators/task.validators";
import { audit } from "./audit.service";
import { hoursOf } from "./workLog.service";

const MANAGERS = ["ADMIN", "MANAGER"];
const CLOSED: TaskStatus[] = ["DONE", "CANCELLED"];

export const STATUS_LABEL: Record<TaskStatus, string> = { TODO: "To do", IN_PROGRESS: "In progress", IN_REVIEW: "In review", DONE: "Done", CANCELLED: "Cancelled" };

const include = {
  client: { select: { id: true, name: true } },
  assignee: { select: { id: true, fullName: true, employeeCode: true } },
  assignedBy: { select: { name: true } },
  _count: { select: { comments: true } },
} satisfies Prisma.TaskInclude;

type TaskRow = Prisma.TaskGetPayload<{ include: typeof include }>;

export function isManager(user: AuthUser) {
  return MANAGERS.includes(user.role);
}

/** Admins, managers and employees all work on the shared task board. */
function scope(user: AuthUser): Prisma.TaskWhereInput {
  if (isManager(user) || user.role === "EMPLOYEE") return {};
  throw AppError.forbidden();
}

async function loggedMinutes(taskIds: string[]) {
  if (taskIds.length === 0) return new Map<string, number>();
  const rows = await prisma.workLog.groupBy({ by: ["taskId"], where: { taskId: { in: taskIds } }, _sum: { minutes: true } });
  return new Map(rows.map((r) => [r.taskId!, r._sum.minutes ?? 0]));
}

function shape(task: TaskRow, minutes: number) {
  const today = todayUtc();
  return {
    ...task,
    loggedHours: hoursOf(minutes),
    overdue: Boolean(task.dueDate && task.dueDate < today && !CLOSED.includes(task.status)),
  };
}

// ---------------------------------------------------------------------------
// Readable history
// ---------------------------------------------------------------------------

const words = (value: string) => value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, " ");

interface ReadableInput {
  title: string;
  description: string | null;
  clientId: string | null;
  assigneeName: string;
  taskType: string;
  priority: string;
  status: TaskStatus;
  dueDate: Date | null;
  estimatedHours: number | string | null;
}

/** Task fields as people read them (names, not IDs), so history shows e.g. "Priority: Medium → High". */
async function readable(t: ReadableInput, tx: Tx = prisma): Promise<Record<string, string>> {
  const client = t.clientId ? await tx.client.findUnique({ where: { id: t.clientId }, select: { name: true } }) : null;
  const details = t.description ? (t.description.length > 300 ? `${t.description.slice(0, 300)}…` : t.description) : "—";
  return {
    Title: t.title,
    "Assigned to": t.assigneeName,
    Client: client?.name ?? "Internal",
    "Type of work": words(t.taskType),
    Priority: words(t.priority),
    Status: STATUS_LABEL[t.status],
    "Due date": t.dueDate ? t.dueDate.toISOString().slice(0, 10) : "—",
    "Estimated hours": t.estimatedHours !== null && t.estimatedHours !== "" ? String(Number(t.estimatedHours)) : "—",
    Details: details,
  };
}

function changedFields(before: Record<string, string>, after: Record<string, string>) {
  return Object.keys(after)
    .filter((field) => before[field] !== after[field])
    .map((field) => ({ field, from: before[field], to: after[field] }));
}

/** Records an event in the task's history (stored in the audit log, which cannot be edited from the app). */
export function recordTaskEvent(req: Request | null, taskId: string, clientId: string | null, action: string, summary: string, changes?: Prisma.InputJsonValue, tx: Tx = prisma) {
  return audit(req, { action, entityType: "Task", entityId: taskId, clientId, summary, changes }, tx);
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function listTasks(user: AuthUser, query: z.infer<typeof taskListQuery>) {
  const where: Prisma.TaskWhereInput = {
    AND: [
      scope(user),
      query.assigneeId ? { assigneeId: query.assigneeId } : {},
      query.clientId ? { clientId: query.clientId } : {},
      query.status ? { status: query.status } : {},
      query.priority ? { priority: query.priority } : {},
      query.openOnly ? { status: { notIn: CLOSED } } : {},
      query.overdue ? { dueDate: { lt: todayUtc() }, status: { notIn: CLOSED } } : {},
      query.search
        ? { OR: [{ title: { contains: query.search, mode: "insensitive" } }, { description: { contains: query.search, mode: "insensitive" } }, { client: { name: { contains: query.search, mode: "insensitive" } } }] }
        : {},
    ],
  };
  const [rows, total, counts] = await prisma.$transaction([
    prisma.task.findMany({
      where,
      include,
      // Urgent first, then soonest due; tasks without a due date last.
      orderBy: [{ priority: "desc" }, { dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.task.count({ where }),
    prisma.task.groupBy({ by: ["status"], where: scope(user), _count: true, orderBy: { status: "asc" } }),
  ]);
  const minutes = await loggedMinutes(rows.map((r) => r.id));
  const overdue = await prisma.task.count({ where: { AND: [scope(user), { dueDate: { lt: todayUtc() }, status: { notIn: CLOSED } }] } });
  return {
    items: rows.map((r) => shape(r, minutes.get(r.id) ?? 0)),
    total,
    summary: { byStatus: Object.fromEntries(counts.map((c) => [c.status, c._count])), overdue },
  };
}

async function findVisible(user: AuthUser, id: string) {
  const task = await prisma.task.findFirst({ where: { AND: [{ id }, scope(user)] }, include });
  if (!task) throw AppError.notFound("Task");
  return task;
}

export async function getTask(user: AuthUser, id: string) {
  const task = await findVisible(user, id);
  const [comments, workLogs, history] = await Promise.all([
    prisma.taskComment.findMany({ where: { taskId: id }, orderBy: { createdAt: "asc" }, include: { author: { select: { name: true } } } }),
    prisma.workLog.findMany({
      where: { taskId: id },
      orderBy: { workDate: "desc" },
      select: { id: true, workDate: true, minutes: true, title: true, employee: { select: { fullName: true } } },
    }),
    prisma.auditLog.findMany({
      where: { entityType: "Task", entityId: id },
      orderBy: { createdAt: "asc" },
      select: { id: true, action: true, summary: true, changes: true, createdAt: true, user: { select: { name: true } } },
    }),
  ]);
  const minutes = workLogs.reduce((a, l) => a + l.minutes, 0);
  return { ...shape(task, minutes), comments, workLogs: workLogs.map((l) => ({ ...l, hours: hoursOf(l.minutes) })), history };
}

// ---------------------------------------------------------------------------
// Changes
// ---------------------------------------------------------------------------

async function assertRefs(input: z.infer<typeof taskSchema>) {
  const employee = await prisma.employee.findUnique({ where: { id: input.assigneeId } });
  if (!employee) throw AppError.badRequest("Employee not found");
  if (["RESIGNED", "TERMINATED"].includes(employee.status)) throw AppError.badRequest(`${employee.fullName} is no longer active`);
  if (input.clientId && !(await prisma.client.findUnique({ where: { id: input.clientId } }))) throw AppError.badRequest("Client not found");
  return employee;
}

/** Keeps startedAt/completedAt in step with status changes. */
function statusTimestamps(to: TaskStatus, started: Date | null) {
  return {
    ...(to !== "TODO" && !started ? { startedAt: new Date() } : {}),
    completedAt: to === "DONE" ? new Date() : null,
  };
}

export async function createTask(req: Request, user: AuthUser, input: z.infer<typeof taskSchema>) {
  const employee = await assertRefs(input);
  const task = await prisma.$transaction(async (tx) => {
    const created = await tx.task.create({
      data: { ...input, assignedById: user.id, ...statusTimestamps(input.status, null) },
    });
    const snapshot = await readable({ ...input, assigneeName: employee.fullName }, tx);
    const fields = Object.entries(snapshot)
      .filter(([, value]) => value !== "—")
      .map(([field, to]) => ({ field, from: null, to }));
    await recordTaskEvent(req, created.id, input.clientId, "CREATE", `Created the task and assigned it to ${employee.fullName}`, { fields }, tx);
    return created;
  });
  return getTask(user, task.id);
}

export async function updateTask(req: Request, user: AuthUser, id: string, input: z.infer<typeof taskSchema>) {
  const before = await findVisible(user, id);
  const employee = await assertRefs(input);
  await prisma.$transaction(async (tx) => {
    const fields = changedFields(
      await readable({ ...before, estimatedHours: before.estimatedHours?.toString() ?? null, assigneeName: before.assignee.fullName }, tx),
      await readable({ ...input, assigneeName: employee.fullName }, tx),
    );
    if (fields.length === 0) return;
    await tx.task.update({
      where: { id },
      data: { ...input, ...(before.status !== input.status ? statusTimestamps(input.status, before.startedAt) : {}) },
    });
    const reassigned = before.assigneeId !== input.assigneeId;
    const summary = reassigned ? `Reassigned the task to ${employee.fullName}` : `Changed ${fields.map((f) => f.field.toLowerCase()).join(", ")}`;
    await recordTaskEvent(req, id, input.clientId, reassigned ? "REASSIGN" : "UPDATE", summary, { fields }, tx);
  });
  return getTask(user, id);
}

/** Status change from a button or by dragging on the board. */
export async function setStatus(req: Request, user: AuthUser, id: string, status: TaskStatus) {
  const task = await findVisible(user, id);
  if (task.status === status) return getTask(user, id);
  await prisma.$transaction(async (tx) => {
    await tx.task.update({ where: { id }, data: { status, ...statusTimestamps(status, task.startedAt) } });
    await recordTaskEvent(
      req,
      id,
      task.clientId,
      "STATUS_CHANGE",
      `Moved from ${STATUS_LABEL[task.status]} to ${STATUS_LABEL[status]}`,
      { fields: [{ field: "Status", from: STATUS_LABEL[task.status], to: STATUS_LABEL[status] }] },
      tx,
    );
  });
  return getTask(user, id);
}

export async function addComment(req: Request, user: AuthUser, id: string, body: string) {
  const task = await findVisible(user, id);
  await prisma.$transaction(async (tx) => {
    await tx.taskComment.create({ data: { taskId: id, authorId: user.id, body } });
    await recordTaskEvent(req, id, task.clientId, "COMMENT", "Posted an update", { comment: body.slice(0, 500) }, tx);
  });
  return getTask(user, id);
}

export async function deleteTask(req: Request, user: AuthUser, id: string) {
  const task = await findVisible(user, id);
  await prisma.$transaction(async (tx) => {
    await tx.task.delete({ where: { id } });
    await recordTaskEvent(req, id, task.clientId, "DELETE", `Deleted the task "${task.title}"`, undefined, tx);
  });
}

/** Open tasks of the signed-in employee, for picking a task when logging work. */
export function taskOptions(user: AuthUser, employeeId?: string) {
  const assigneeId = isManager(user) ? employeeId : (user.employeeId ?? undefined);
  if (!assigneeId) return Promise.resolve([]);
  return prisma.task.findMany({
    where: { assigneeId, status: { notIn: CLOSED } },
    select: { id: true, title: true, clientId: true, taskType: true },
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }],
  });
}
