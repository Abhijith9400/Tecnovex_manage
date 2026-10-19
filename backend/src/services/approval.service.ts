/**
 * Approval requests.
 * - A manager's client payments, expenses and payroll payouts wait for an administrator.
 * - An employee's deletes wait for a manager or administrator.
 * Nothing changes until approval. Approving replays the original action as the approver, so receipts,
 * invoice balances and totals only ever include approved entries, and the normal audit trail is kept.
 */
import type { Request } from "express";
import type { z } from "zod";
import { prisma, type Prisma } from "../db/prisma";
import type { ApprovalKind, ApprovalStatus } from "../generated/prisma/enums";
import type { AuthUser } from "../types/express";
import { AppError } from "../utils/AppError";
import { periodLabel } from "../utils/dates";
import { money } from "../utils/money";
import { expenseSchema } from "../validators/finance.validators";
import { payrollPaySchema } from "../validators/employee.validators";
import { paymentSchema } from "../validators/payment.validators";
import { deleteCampaign } from "./adCampaign.service";
import { audit } from "./audit.service";
import { deleteEvent } from "./calendar.service";
import { setArchived } from "./client.service";
import { deleteCalendar } from "./contentCalendar.service";
import { deleteCreative, removeFile } from "./creative.service";
import { deleteStoredFile, storeUpload } from "./file.service";
import { assertCategory, createExpense } from "./finance.service";
import { recordPayment } from "./payment.service";
import { findWithStatus, markPaid } from "./payroll.service";
import { deleteTask } from "./task.service";
import { deleteLog } from "./workLog.service";

const MONEY_KINDS: ApprovalKind[] = ["PAYMENT", "EXPENSE", "PAYROLL_PAYMENT"];

/** Whether this user's action must go through approval instead of happening now. */
export function needsApproval(user: AuthUser, kind: ApprovalKind) {
  return kind === "DELETE" ? user.role === "EMPLOYEE" : user.role === "MANAGER";
}

/** Money is approved by administrators; deletes by administrators or managers. */
export function canReview(user: AuthUser, kind: ApprovalKind) {
  return MONEY_KINDS.includes(kind) ? user.role === "ADMIN" : user.role === "ADMIN" || user.role === "MANAGER";
}

function reviewableKinds(user: AuthUser): ApprovalKind[] {
  return (["PAYMENT", "EXPENSE", "PAYROLL_PAYMENT", "DELETE"] as ApprovalKind[]).filter((k) => canReview(user, k));
}

/** JSON-safe copy of a validated body; dates go back to the YYYY-MM-DD form the validators accept. */
function toPayload(input: object): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(input, (_key, value) => (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/.test(value) ? value.slice(0, 10) : value)));
}

const fmt = (value: Prisma.Decimal | string | number) => money(value).toFixed(2);

const include = {
  requestedBy: { select: { id: true, name: true, role: true } },
  reviewedBy: { select: { id: true, name: true } },
} satisfies Prisma.ApprovalRequestInclude;

async function create(
  req: Request,
  user: AuthUser,
  data: { kind: ApprovalKind; title: string; payload: object; entityType?: string; entityId?: string; amount?: string; attachmentId?: string; idempotencyKey?: string | null },
) {
  if (data.idempotencyKey) {
    const existing = await prisma.approvalRequest.findUnique({ where: { idempotencyKey: data.idempotencyKey }, include });
    if (existing) return existing;
  }
  return prisma.$transaction(async (tx) => {
    const request = await tx.approvalRequest.create({
      data: { ...data, payload: toPayload(data.payload), idempotencyKey: data.idempotencyKey ?? null, requestedById: user.id },
      include,
    });
    await audit(req, { action: "REQUEST", entityType: "ApprovalRequest", entityId: request.id, summary: `Approval requested: ${request.title}` }, tx);
    return request;
  });
}

// ---------------------------------------------------------------------------
// Money (manager → administrator)
// ---------------------------------------------------------------------------

export async function requestPayment(req: Request, user: AuthUser, input: z.infer<typeof paymentSchema>, proof?: Express.Multer.File) {
  let clientName: string;
  let invoiceNumber: string | null = null;
  if (input.invoiceId) {
    const invoice = await prisma.invoice.findUnique({ where: { id: input.invoiceId }, include: { client: { select: { name: true } } } });
    if (!invoice) throw AppError.badRequest("Invoice not found");
    if (!["ISSUED", "PARTIALLY_PAID", "OVERDUE"].includes(invoice.status)) throw AppError.badRequest(`Cannot record a payment on a ${invoice.status.toLowerCase()} invoice`);
    if (money(input.amount).greaterThan(money(invoice.total).minus(invoice.amountPaid))) throw AppError.badRequest("The amount is more than the invoice balance");
    clientName = invoice.client.name;
    invoiceNumber = invoice.invoiceNumber;
  } else {
    if (!input.clientId) throw AppError.badRequest("Choose an invoice or a client");
    const client = await prisma.client.findUnique({ where: { id: input.clientId }, select: { name: true } });
    if (!client) throw AppError.badRequest("Client not found");
    clientName = client.name;
  }
  const attachment = proof ? await storeUpload(proof, "PAYMENT_PROOF", user.id) : null;
  const { idempotencyKey, ...payload } = input;
  return create(req, user, {
    kind: "PAYMENT",
    title: `Payment of ${fmt(input.amount)} from ${clientName}${invoiceNumber ? ` for ${invoiceNumber}` : ""}`,
    payload,
    amount: fmt(input.amount),
    attachmentId: attachment?.id,
    idempotencyKey,
  });
}

export async function requestExpense(req: Request, user: AuthUser, input: z.infer<typeof expenseSchema>, receipt?: Express.Multer.File) {
  await assertCategory(input.categoryId, "EXPENSE");
  const attachment = receipt ? await storeUpload(receipt, "EXPENSE_RECEIPT", user.id) : null;
  return create(req, user, {
    kind: "EXPENSE",
    title: `Expense "${input.title}" of ${fmt(input.amount)}`,
    payload: input,
    amount: fmt(input.amount),
    attachmentId: attachment?.id,
  });
}

export async function requestPayrollPayment(req: Request, user: AuthUser, payrollId: string, input: z.infer<typeof payrollPaySchema>) {
  const record = await findWithStatus(payrollId, ["APPROVED"], "marked paid");
  const pending = await prisma.approvalRequest.findFirst({ where: { kind: "PAYROLL_PAYMENT", entityId: payrollId, status: "PENDING" }, include });
  if (pending) return pending;
  return create(req, user, {
    kind: "PAYROLL_PAYMENT",
    title: `Pay ${record.employee.fullName} (${record.employee.employeeCode}) ${fmt(record.netPay)} for ${periodLabel(record.periodYear, record.periodMonth)}`,
    entityType: "PayrollRecord",
    entityId: payrollId,
    payload: input,
    amount: fmt(record.netPay),
  });
}

// ---------------------------------------------------------------------------
// Deletes (employee → manager or administrator)
// ---------------------------------------------------------------------------

type DeleteParams = Record<string, string | undefined>;

interface DeleteHandler {
  describe: (id: string, params: DeleteParams) => Promise<string>;
  /** Extra check that the requester may ask for this delete. */
  check?: (user: AuthUser, id: string) => Promise<void>;
  run: (req: Request, approver: AuthUser, id: string, params: DeleteParams) => Promise<unknown>;
}

const notFound = (what: string): never => {
  throw AppError.notFound(what);
};

const DELETE_HANDLERS: Record<string, DeleteHandler> = {
  Task: {
    describe: async (id) => `Delete task "${(await prisma.task.findUnique({ where: { id } }))?.title ?? notFound("Task")}"`,
    run: (req, approver, id) => deleteTask(req, approver, id),
  },
  CreativeAsset: {
    describe: async (id) => `Delete creative "${(await prisma.creativeAsset.findUnique({ where: { id } }))?.title ?? notFound("Creative")}"`,
    run: (req, _approver, id, p) => deleteCreative(req, p.clientId!, id),
  },
  CreativeFile: {
    describe: async (id, p) => {
      const file = await prisma.storedFile.findUnique({ where: { id } });
      const creative = await prisma.creativeAsset.findUnique({ where: { id: p.creativeId! } });
      if (!file || !creative) notFound("File");
      return `Remove file "${file!.originalName}" from creative "${creative!.title}"`;
    },
    run: (req, _approver, id, p) => removeFile(req, p.clientId!, p.creativeId!, id),
  },
  CalendarEvent: {
    describe: async (id, p) => {
      const event = await prisma.calendarEvent.findUnique({ where: { id } });
      if (!event) notFound("Event");
      return p.occurrence && event!.recurrence !== "NONE" ? `Delete the ${p.occurrence} occurrence of "${event!.title}"` : `Delete calendar event "${event!.title}"`;
    },
    run: (req, approver, id, p) => deleteEvent(req, approver, id, p.occurrence),
  },
  AdCampaign: {
    describe: async (id) => `Delete ad campaign "${(await prisma.adCampaign.findUnique({ where: { id } }))?.name ?? notFound("Campaign")}"`,
    run: (req, _approver, id) => deleteCampaign(req, id),
  },
  WorkLog: {
    describe: async (id) => {
      const log = await prisma.workLog.findUnique({ where: { id } });
      if (!log) notFound("Work log entry");
      return `Delete work log "${log!.title}" (${(log!.minutes / 60).toFixed(2)} h)`;
    },
    check: async (user, id) => {
      const log = await prisma.workLog.findUnique({ where: { id }, select: { employeeId: true } });
      if (!log || log.employeeId !== user.employeeId) notFound("Work log entry");
    },
    run: (req, approver, id) => deleteLog(req, approver, id),
  },
  ContentCalendar: {
    describe: async (id) => {
      const row = await prisma.contentCalendar.findUnique({ where: { id } });
      if (!row) notFound("Content calendar");
      return `Delete content calendar "${row!.title}" (${row!.period})`;
    },
    run: (req, _approver, id) => deleteCalendar(req, id),
  },
  Client: {
    describe: async (id) => `Archive client "${(await prisma.client.findUnique({ where: { id } }))?.name ?? notFound("Client")}"`,
    run: (req, _approver, id) => setArchived(req, id, true),
  },
};

export async function requestDelete(req: Request, user: AuthUser, entityType: keyof typeof DELETE_HANDLERS, entityId: string, params: DeleteParams = {}) {
  const handler = DELETE_HANDLERS[entityType];
  await handler.check?.(user, entityId);
  const pending = await prisma.approvalRequest.findFirst({ where: { kind: "DELETE", entityType, entityId, status: "PENDING" }, include });
  if (pending) return pending;
  return create(req, user, { kind: "DELETE", title: await handler.describe(entityId, params), entityType, entityId, payload: params });
}

// ---------------------------------------------------------------------------
// Review
// ---------------------------------------------------------------------------

async function execute(req: Request, approver: AuthUser, request: { kind: ApprovalKind; payload: Prisma.JsonValue; entityType: string | null; entityId: string | null; attachmentId: string | null }) {
  switch (request.kind) {
    case "PAYMENT": {
      const result = await recordPayment(req, paymentSchema.parse(request.payload), undefined, request.attachmentId ?? undefined);
      return result.payment.id;
    }
    case "EXPENSE":
      return (await createExpense(req, expenseSchema.parse(request.payload), undefined, request.attachmentId ?? undefined)).id;
    case "PAYROLL_PAYMENT":
      await markPaid(req, request.entityId!, payrollPaySchema.parse(request.payload));
      return request.entityId;
    case "DELETE":
      await DELETE_HANDLERS[request.entityType!].run(req, approver, request.entityId!, request.payload as DeleteParams);
      return null;
  }
}

async function findForReview(user: AuthUser, id: string) {
  const request = await prisma.approvalRequest.findUnique({ where: { id } });
  if (!request) throw AppError.notFound("Request");
  if (!canReview(user, request.kind)) throw AppError.forbidden(MONEY_KINDS.includes(request.kind) ? "Only an administrator can approve money entries" : "Only an admin or manager can approve this");
  if (request.status !== "PENDING") throw AppError.badRequest(`This request was already ${request.status.toLowerCase()}`);
  return request;
}

export async function approve(req: Request, user: AuthUser, id: string, note?: string) {
  const request = await findForReview(user, id);
  // Claim it first so two reviewers can't both run it.
  const claimed = await prisma.approvalRequest.updateMany({ where: { id, status: "PENDING" }, data: { status: "APPROVED", reviewedById: user.id, reviewedAt: new Date(), reviewNote: note ?? null } });
  if (claimed.count === 0) throw AppError.conflict("Someone else already reviewed this request");
  let resultId: string | null;
  try {
    resultId = await execute(req, user, request);
  } catch (error) {
    await prisma.approvalRequest.update({ where: { id }, data: { status: "PENDING", reviewedById: null, reviewedAt: null, reviewNote: null } });
    throw error;
  }
  await prisma.approvalRequest.update({ where: { id }, data: { resultId } });
  await audit(req, { action: "APPROVE", entityType: "ApprovalRequest", entityId: id, summary: `Approved: ${request.title}` });
  return getRequest(user, id);
}

export async function reject(req: Request, user: AuthUser, id: string, note?: string) {
  const request = await findForReview(user, id);
  await closeRequest(request, "REJECTED", user.id, note);
  await audit(req, { action: "REJECT", entityType: "ApprovalRequest", entityId: id, summary: `Rejected: ${request.title}${note ? ` (${note})` : ""}` });
  return getRequest(user, id);
}

/** The person who asked can withdraw a pending request. */
export async function cancel(req: Request, user: AuthUser, id: string) {
  const request = await prisma.approvalRequest.findUnique({ where: { id } });
  if (!request || request.requestedById !== user.id) throw AppError.notFound("Request");
  if (request.status !== "PENDING") throw AppError.badRequest(`This request was already ${request.status.toLowerCase()}`);
  await closeRequest(request, "CANCELLED", null);
  await audit(req, { action: "CANCEL", entityType: "ApprovalRequest", entityId: id, summary: `Withdrawn: ${request.title}` });
  return getRequest(user, id);
}

async function closeRequest(request: { id: string; attachmentId: string | null }, status: ApprovalStatus, reviewerId: string | null, note?: string) {
  const closed = await prisma.approvalRequest.updateMany({
    where: { id: request.id, status: "PENDING" },
    data: { status, reviewedById: reviewerId, reviewedAt: new Date(), reviewNote: note ?? null },
  });
  if (closed.count === 0) throw AppError.conflict("Someone else already reviewed this request");
  // The uploaded proof/receipt was never attached to anything.
  if (request.attachmentId) await deleteStoredFile(request.attachmentId).catch(() => undefined);
}

// ---------------------------------------------------------------------------
// Listing
// ---------------------------------------------------------------------------

/** Reviewers see what they can review plus their own requests; everyone else sees only their own. */
function visibleTo(user: AuthUser): Prisma.ApprovalRequestWhereInput {
  const kinds = reviewableKinds(user);
  return kinds.length ? { OR: [{ kind: { in: kinds } }, { requestedById: user.id }] } : { requestedById: user.id };
}

function shape(user: AuthUser, request: Prisma.ApprovalRequestGetPayload<{ include: typeof include }>) {
  return {
    ...request,
    canReview: request.status === "PENDING" && canReview(user, request.kind) && request.requestedById !== user.id,
    canCancel: request.status === "PENDING" && request.requestedById === user.id,
  };
}

export async function listRequests(
  user: AuthUser,
  query: { status?: ApprovalStatus; kind?: ApprovalKind; mine?: boolean; toReview?: boolean; page: number; pageSize: number },
) {
  const where: Prisma.ApprovalRequestWhereInput = {
    AND: [
      visibleTo(user),
      query.status ? { status: query.status } : {},
      query.kind ? { kind: query.kind } : {},
      query.mine ? { requestedById: user.id } : {},
      query.toReview ? { status: "PENDING", kind: { in: reviewableKinds(user) }, requestedById: { not: user.id } } : {},
    ],
  };
  const [items, total] = await Promise.all([
    prisma.approvalRequest.findMany({ where, include, orderBy: { createdAt: "desc" }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
    prisma.approvalRequest.count({ where }),
  ]);
  return { items: items.map((r) => shape(user, r)), total };
}

export async function getRequest(user: AuthUser, id: string) {
  const request = await prisma.approvalRequest.findFirst({ where: { AND: [{ id }, visibleTo(user)] }, include });
  if (!request) throw AppError.notFound("Request");
  return shape(user, request);
}

/** Pending requests waiting for this user (for the sidebar badge). */
export async function pendingCount(user: AuthUser) {
  const kinds = reviewableKinds(user);
  const [toReview, mine] = await Promise.all([
    kinds.length ? prisma.approvalRequest.count({ where: { status: "PENDING", kind: { in: kinds }, requestedById: { not: user.id } } }) : 0,
    prisma.approvalRequest.count({ where: { status: "PENDING", requestedById: user.id } }),
  ]);
  return { toReview, mine };
}
