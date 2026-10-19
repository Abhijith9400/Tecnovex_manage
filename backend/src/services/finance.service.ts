/** Expenses and other income: simple cash records with optional attachments, voided rather than deleted. */
import type { Request } from "express";
import type { z } from "zod";
import { prisma, type Prisma } from "../db/prisma";
import type { CategoryType } from "../generated/prisma/enums";
import { AppError } from "../utils/AppError";
import type { expenseSchema, financeListQuery, incomeSchema } from "../validators/finance.validators";
import { audit, diff } from "./audit.service";
import { deleteStoredFile, publicFile, storeUpload } from "./file.service";
import { referenceKey } from "./payment.service";

type ListQuery = z.infer<typeof financeListQuery>;

export async function assertCategory(categoryId: string, type: CategoryType) {
  const category = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!category || category.type !== type) throw AppError.badRequest(`Choose a valid ${type.toLowerCase()} category`);
  if (!category.isActive) throw AppError.badRequest(`Category "${category.name}" is inactive`);
}

function dateFilter(from?: Date, to?: Date) {
  return from || to ? { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } : undefined;
}

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------

const expenseInclude = {
  category: { select: { id: true, name: true } },
  receiptFile: true,
  createdBy: { select: { name: true } },
} satisfies Prisma.ExpenseInclude;

function shapeExpense({ receiptFile, ...expense }: Prisma.ExpenseGetPayload<{ include: typeof expenseInclude }>) {
  return { ...expense, receipt: publicFile(receiptFile) };
}

export function expenseWhere(query: ListQuery): Prisma.ExpenseWhereInput {
  return {
    ...(query.includeVoided ? {} : { voidedAt: null }),
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.paymentMethod ? { paymentMethod: query.paymentMethod } : {}),
    ...(dateFilter(query.from, query.to) ? { expenseDate: dateFilter(query.from, query.to) } : {}),
    ...(query.search
      ? {
          OR: [
            { title: { contains: query.search, mode: "insensitive" } },
            { vendor: { contains: query.search, mode: "insensitive" } },
            { reference: { contains: query.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

export async function listExpenses(query: ListQuery, all = false) {
  const where = expenseWhere(query);
  const [items, total, totals] = await prisma.$transaction([
    prisma.expense.findMany({
      where,
      include: expenseInclude,
      orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }],
      skip: all ? 0 : (query.page - 1) * query.pageSize,
      take: all ? 10_000 : query.pageSize,
    }),
    prisma.expense.count({ where }),
    prisma.expense.aggregate({ where: { ...where, voidedAt: null }, _sum: { amount: true } }),
  ]);
  return { items: items.map(shapeExpense), total, sum: (totals._sum.amount ?? 0).toString() };
}

export async function getExpense(id: string) {
  const expense = await prisma.expense.findUnique({ where: { id }, include: expenseInclude });
  if (!expense) throw AppError.notFound("Expense");
  return shapeExpense(expense);
}

/** `storedReceiptId` attaches a receipt uploaded earlier (a manager's expense approved later). */
export async function createExpense(req: Request, input: z.infer<typeof expenseSchema>, file?: Express.Multer.File, storedReceiptId?: string) {
  await assertCategory(input.categoryId, "EXPENSE");
  const expense = await prisma.$transaction(async (tx) => {
    const receipt = file ? await storeUpload(file, "EXPENSE_RECEIPT", req.user?.id, {}, tx) : null;
    const created = await tx.expense.create({ data: { ...input, receiptFileId: receipt?.id ?? storedReceiptId ?? null, createdById: req.user?.id } });
    await audit(req, { action: "CREATE", entityType: "Expense", entityId: created.id, summary: `Expense "${created.title}" of ${created.amount.toFixed(2)} recorded` }, tx);
    return created;
  });
  return getExpense(expense.id);
}

export async function updateExpense(req: Request, id: string, input: z.infer<typeof expenseSchema>, file?: Express.Multer.File) {
  const before = await prisma.expense.findUnique({ where: { id } });
  if (!before) throw AppError.notFound("Expense");
  if (before.voidedAt) throw AppError.badRequest("Voided expenses cannot be edited");
  if (input.categoryId !== before.categoryId) await assertCategory(input.categoryId, "EXPENSE");
  await prisma.$transaction(async (tx) => {
    const receipt = file ? await storeUpload(file, "EXPENSE_RECEIPT", req.user?.id, {}, tx) : null;
    await tx.expense.update({ where: { id }, data: { ...input, ...(receipt ? { receiptFileId: receipt.id } : {}) } });
    await audit(req, { action: "UPDATE", entityType: "Expense", entityId: id, summary: `Expense "${input.title}" updated`, changes: diff(before, input) }, tx);
  });
  if (file && before.receiptFileId) await deleteStoredFile(before.receiptFileId);
  return getExpense(id);
}

export async function voidExpense(req: Request, id: string, reason: string) {
  const expense = await prisma.expense.findUnique({ where: { id } });
  if (!expense) throw AppError.notFound("Expense");
  if (expense.voidedAt) throw AppError.badRequest("Expense already voided");
  await prisma.$transaction(async (tx) => {
    await tx.expense.update({ where: { id }, data: { voidedAt: new Date(), voidReason: reason } });
    await audit(req, { action: "VOID", entityType: "Expense", entityId: id, summary: `Expense "${expense.title}" (${expense.amount.toFixed(2)}) voided: ${reason}` }, tx);
  });
  return getExpense(id);
}

// ---------------------------------------------------------------------------
// Other income
// ---------------------------------------------------------------------------

const incomeInclude = {
  category: { select: { id: true, name: true } },
  attachmentFile: true,
  createdBy: { select: { name: true } },
} satisfies Prisma.IncomeEntryInclude;

function shapeIncome({ attachmentFile, ...entry }: Prisma.IncomeEntryGetPayload<{ include: typeof incomeInclude }>) {
  return { ...entry, attachment: publicFile(attachmentFile) };
}

export function incomeWhere(query: ListQuery): Prisma.IncomeEntryWhereInput {
  return {
    ...(query.includeVoided ? {} : { voidedAt: null }),
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.paymentMethod ? { paymentMethod: query.paymentMethod } : {}),
    ...(dateFilter(query.from, query.to) ? { incomeDate: dateFilter(query.from, query.to) } : {}),
    ...(query.search
      ? {
          OR: [
            { description: { contains: query.search, mode: "insensitive" } },
            { source: { contains: query.search, mode: "insensitive" } },
            { reference: { contains: query.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

export async function listIncome(query: ListQuery, all = false) {
  const where = incomeWhere(query);
  const [items, total, totals] = await prisma.$transaction([
    prisma.incomeEntry.findMany({
      where,
      include: incomeInclude,
      orderBy: [{ incomeDate: "desc" }, { createdAt: "desc" }],
      skip: all ? 0 : (query.page - 1) * query.pageSize,
      take: all ? 10_000 : query.pageSize,
    }),
    prisma.incomeEntry.count({ where }),
    prisma.incomeEntry.aggregate({ where: { ...where, voidedAt: null }, _sum: { amount: true } }),
  ]);
  return { items: items.map(shapeIncome), total, sum: (totals._sum.amount ?? 0).toString() };
}

export async function getIncome(id: string) {
  const entry = await prisma.incomeEntry.findUnique({ where: { id }, include: incomeInclude });
  if (!entry) throw AppError.notFound("Income entry");
  return shapeIncome(entry);
}

/** Guards against entering a client invoice collection a second time as "other income". */
async function assertNotAClientPayment(method: string, reference: string | null) {
  const key = referenceKey(method, reference);
  if (!key) return;
  const payment = await prisma.payment.findUnique({ where: { referenceKey: key }, select: { receiptNumber: true } });
  if (payment) {
    throw AppError.conflict(`Reference "${reference}" is already recorded as client payment ${payment.receiptNumber}. Client collections must not be entered as other income.`);
  }
}

export async function createIncome(req: Request, input: z.infer<typeof incomeSchema>, file?: Express.Multer.File) {
  await assertCategory(input.categoryId, "INCOME");
  await assertNotAClientPayment(input.paymentMethod, input.reference);
  const entry = await prisma.$transaction(async (tx) => {
    const attachment = file ? await storeUpload(file, "INCOME_ATTACHMENT", req.user?.id, {}, tx) : null;
    const created = await tx.incomeEntry.create({ data: { ...input, attachmentFileId: attachment?.id ?? null, createdById: req.user?.id } });
    await audit(req, { action: "CREATE", entityType: "IncomeEntry", entityId: created.id, summary: `Other income "${created.description}" of ${created.amount.toFixed(2)} recorded` }, tx);
    return created;
  });
  return getIncome(entry.id);
}

export async function updateIncome(req: Request, id: string, input: z.infer<typeof incomeSchema>, file?: Express.Multer.File) {
  const before = await prisma.incomeEntry.findUnique({ where: { id } });
  if (!before) throw AppError.notFound("Income entry");
  if (before.voidedAt) throw AppError.badRequest("Voided entries cannot be edited");
  if (input.categoryId !== before.categoryId) await assertCategory(input.categoryId, "INCOME");
  await assertNotAClientPayment(input.paymentMethod, input.reference);
  await prisma.$transaction(async (tx) => {
    const attachment = file ? await storeUpload(file, "INCOME_ATTACHMENT", req.user?.id, {}, tx) : null;
    await tx.incomeEntry.update({ where: { id }, data: { ...input, ...(attachment ? { attachmentFileId: attachment.id } : {}) } });
    await audit(req, { action: "UPDATE", entityType: "IncomeEntry", entityId: id, summary: `Other income "${input.description}" updated`, changes: diff(before, input) }, tx);
  });
  if (file && before.attachmentFileId) await deleteStoredFile(before.attachmentFileId);
  return getIncome(id);
}

export async function voidIncome(req: Request, id: string, reason: string) {
  const entry = await prisma.incomeEntry.findUnique({ where: { id } });
  if (!entry) throw AppError.notFound("Income entry");
  if (entry.voidedAt) throw AppError.badRequest("Entry already voided");
  await prisma.$transaction(async (tx) => {
    await tx.incomeEntry.update({ where: { id }, data: { voidedAt: new Date(), voidReason: reason } });
    await audit(req, { action: "VOID", entityType: "IncomeEntry", entityId: id, summary: `Other income "${entry.description}" (${entry.amount.toFixed(2)}) voided: ${reason}` }, tx);
  });
  return getIncome(id);
}
