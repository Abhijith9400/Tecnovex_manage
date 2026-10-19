import type { Request } from "express";
import type { z } from "zod";
import { prisma, type Prisma, type Tx } from "../db/prisma";
import type { InvoiceStatus } from "../generated/prisma/enums";
import { AppError } from "../utils/AppError";
import { addDays, financialYear, parsePeriod, periodLabel, todayUtc } from "../utils/dates";
import { calculateInvoiceTotals, money } from "../utils/money";
import type { generateSchema, invoiceItemSchema, invoiceListQuery, invoiceSchema, issuedUpdateSchema } from "../validators/invoice.validators";
import { audit } from "./audit.service";
import { assertClientUsable } from "./client.service";
import { nextSequence } from "./sequence.service";

type InvoiceInput = z.infer<typeof invoiceSchema>;
type ItemInput = z.infer<typeof invoiceItemSchema>;

const OPEN_STATUSES: InvoiceStatus[] = ["ISSUED", "PARTIALLY_PAID", "OVERDUE"];

export const invoiceDetailInclude = {
  client: { select: { id: true, name: true } },
  items: { orderBy: { sortOrder: "asc" } },
  payments: { orderBy: { paymentDate: "asc" }, include: { proofFile: true, recordedBy: { select: { name: true } } } },
  revisedBy: { select: { id: true, invoiceNumber: true } },
  revisedFrom: { select: { id: true, invoiceNumber: true } },
} satisfies Prisma.InvoiceInclude;

/** Balance and display status derived from stored totals. */
export function withBalance<T extends { total: Prisma.Decimal; amountPaid: Prisma.Decimal }>(invoice: T) {
  return { ...invoice, balanceDue: money(invoice.total).minus(invoice.amountPaid).toFixed(2) };
}

/** Status for an issued invoice from what has been paid and the due date. */
export function deriveStatus(total: Prisma.Decimal, amountPaid: Prisma.Decimal, dueDate: Date, today = todayUtc()): InvoiceStatus {
  if (money(amountPaid).greaterThanOrEqualTo(total)) return "PAID";
  if (dueDate < today) return "OVERDUE";
  if (money(amountPaid).greaterThan(0)) return "PARTIALLY_PAID";
  return "ISSUED";
}

/** Marks unpaid invoices past their due date as overdue. Cheap; called before reads that show status. */
export async function refreshOverdue() {
  await prisma.invoice.updateMany({
    where: { status: { in: ["ISSUED", "PARTIALLY_PAID"] }, dueDate: { lt: todayUtc() } },
    data: { status: "OVERDUE" },
  });
}

function billTo(client: { name: string; addressLine1: string | null; addressLine2: string | null; city: string | null; state: string | null; postalCode: string | null; country: string; email: string | null; gstin: string | null; pan: string | null }) {
  const cityLine = [client.city, client.state, client.postalCode].filter(Boolean).join(", ");
  return {
    billToName: client.name,
    billToAddress: [client.addressLine1, client.addressLine2, cityLine, client.country].filter(Boolean).join("\n") || null,
    billToEmail: client.email,
    billToGstin: client.gstin,
    billToPan: client.pan,
  };
}

function buildItems(items: ItemInput[]) {
  const { lines, totals } = calculateInvoiceTotals(items);
  return {
    totals,
    items: items.map((item, index) => ({
      serviceId: item.serviceId,
      description: item.description,
      sacCode: item.sacCode,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discount: item.discount,
      taxRate: item.taxRate,
      ...lines[index],
      sortOrder: index,
    })),
  };
}

function safeBuildItems(items: ItemInput[]) {
  try {
    return buildItems(items);
  } catch (error) {
    if (error instanceof RangeError) throw AppError.badRequest(error.message);
    throw error;
  }
}

async function assertServicesBelongToClient(clientId: string, items: ItemInput[]) {
  const ids = [...new Set(items.map((i) => i.serviceId).filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return;
  const count = await prisma.service.count({ where: { id: { in: ids }, clientId } });
  if (count !== ids.length) throw AppError.badRequest("One or more services do not belong to this client");
}

/** Blocks accidental second invoices for the same client and billing month unless explicitly confirmed. */
async function assertNoDuplicatePeriod(clientId: string, billingPeriod: string | null, allowDuplicate: boolean, excludeId?: string) {
  if (!billingPeriod || allowDuplicate) return;
  const existing = await prisma.invoice.findMany({
    where: { clientId, billingPeriod, status: { not: "CANCELLED" }, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true, invoiceNumber: true, status: true, total: true },
  });
  if (existing.length > 0) {
    throw new AppError(409, `This client already has ${existing.length} invoice(s) for ${billingPeriod}. Confirm to create another.`, "DUPLICATE_PERIOD", existing);
  }
}

async function defaultDueDate(clientId: string, issueDate: Date) {
  const client = await prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { paymentTermsDays: true } });
  return addDays(issueDate, client.paymentTermsDays);
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function buildListWhere(query: z.infer<typeof invoiceListQuery>): Prisma.InvoiceWhereInput {
  return {
    ...(query.status ? { status: query.status } : {}),
    ...(query.clientId ? { clientId: query.clientId } : {}),
    ...(query.billingPeriod ? { billingPeriod: query.billingPeriod } : {}),
    ...(query.from || query.to ? { issueDate: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) } } : {}),
    ...(query.search
      ? {
          OR: [
            { invoiceNumber: { contains: query.search, mode: "insensitive" } },
            { billToName: { contains: query.search, mode: "insensitive" } },
            { client: { name: { contains: query.search, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
}

export async function listInvoices(query: z.infer<typeof invoiceListQuery>, all = false) {
  await refreshOverdue();
  const where = buildListWhere(query);
  const [items, total] = await prisma.$transaction([
    prisma.invoice.findMany({
      where,
      include: { client: { select: { id: true, name: true } } },
      orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }],
      skip: all ? 0 : (query.page - 1) * query.pageSize,
      take: all ? 10_000 : query.pageSize,
    }),
    prisma.invoice.count({ where }),
  ]);
  return { items: items.map(withBalance), total };
}

export async function getInvoice(id: string) {
  await refreshOverdue();
  const invoice = await prisma.invoice.findUnique({ where: { id }, include: invoiceDetailInclude });
  if (!invoice) throw AppError.notFound("Invoice");
  return {
    ...withBalance(invoice),
    payments: invoice.payments.map(({ proofFile, ...payment }) => ({
      ...payment,
      proof: proofFile ? { id: proofFile.id, originalName: proofFile.originalName, mimeType: proofFile.mimeType, sizeBytes: proofFile.sizeBytes } : null,
    })),
  };
}

// ---------------------------------------------------------------------------
// Drafts
// ---------------------------------------------------------------------------

export async function createInvoice(req: Request, input: InvoiceInput) {
  await assertClientUsable(input.clientId);
  await assertServicesBelongToClient(input.clientId, input.items);
  await assertNoDuplicatePeriod(input.clientId, input.billingPeriod, input.allowDuplicate);
  const client = await prisma.client.findUniqueOrThrow({ where: { id: input.clientId } });
  const { items, totals } = safeBuildItems(input.items);
  const dueDate = input.dueDate ?? addDays(input.issueDate, client.paymentTermsDays);
  if (dueDate < input.issueDate) throw AppError.badRequest("Due date cannot be before the issue date");
  const settings = await prisma.companySettings.findUnique({ where: { id: 1 } });

  const invoice = await prisma.$transaction(async (tx) => {
    const created = await tx.invoice.create({
      data: {
        clientId: input.clientId,
        billingPeriod: input.billingPeriod,
        issueDate: input.issueDate,
        dueDate,
        templateId: input.templateId,
        currency: settings?.currency ?? "INR",
        notes: input.notes ?? settings?.invoiceNotes ?? null,
        terms: input.terms ?? settings?.paymentTermsText ?? null,
        ...billTo(client),
        ...totals,
        createdById: req.user?.id,
        items: { create: items },
      },
    });
    await audit(req, { action: "CREATE", entityType: "Invoice", entityId: created.id, clientId: input.clientId, summary: `Draft invoice created for ${client.name} (${totals.total.toFixed(2)})` }, tx);
    return created;
  });
  return getInvoice(invoice.id);
}

/** Builds a draft from the client's active recurring services (or monthly retainer) for a billing month. */
export async function generateFromRecurring(req: Request, input: z.infer<typeof generateSchema>) {
  const client = await assertClientUsable(input.clientId);
  const full = await prisma.client.findUniqueOrThrow({ where: { id: client.id }, include: { services: { where: { isActive: true, isRecurring: true }, orderBy: { createdAt: "asc" } } } });
  const { year, month } = parsePeriod(input.billingPeriod);
  const label = periodLabel(year, month);
  const settings = await prisma.companySettings.findUnique({ where: { id: 1 } });

  let lines: ItemInput[] = full.services.map((s) => ({
    serviceId: s.id,
    description: `${s.name}${s.description ? ` - ${s.description}` : ""} (${label})`,
    sacCode: s.sacCode,
    quantity: s.quantity.toFixed(2),
    unitPrice: s.unitPrice.toFixed(2),
    discount: "0",
    taxRate: s.taxRate.toFixed(2),
  }));
  if (lines.length === 0 && full.monthlyRetainer) {
    lines = [
      {
        serviceId: null,
        description: `Monthly retainer (${label})`,
        sacCode: null,
        quantity: "1",
        unitPrice: full.monthlyRetainer.toFixed(2),
        discount: "0",
        taxRate: settings?.isGstRegistered ? settings.defaultTaxRate.toFixed(2) : "0",
      },
    ];
  }
  if (lines.length === 0) throw AppError.badRequest(`${full.name} has no active recurring services or monthly retainer to bill`);

  await assertNoDuplicatePeriod(full.id, input.billingPeriod, input.allowDuplicate);
  const recurringKey = `${full.id}:${input.billingPeriod}`;
  if (!input.allowDuplicate && (await prisma.invoice.findUnique({ where: { recurringKey } }))) {
    throw AppError.conflict(`A recurring invoice for ${label} already exists for ${full.name}`);
  }

  const issueDate = input.issueDate ?? todayUtc();
  const { items, totals } = safeBuildItems(lines);
  const invoice = await prisma.$transaction(async (tx) => {
    const created = await tx.invoice.create({
      data: {
        clientId: full.id,
        billingPeriod: input.billingPeriod,
        // When a duplicate is deliberately allowed, the extra invoice is not the canonical recurring one.
        recurringKey: input.allowDuplicate ? null : recurringKey,
        issueDate,
        dueDate: addDays(issueDate, full.paymentTermsDays),
        currency: settings?.currency ?? "INR",
        notes: settings?.invoiceNotes ?? null,
        terms: settings?.paymentTermsText ?? null,
        ...billTo(full),
        ...totals,
        createdById: req.user?.id,
        items: { create: items },
      },
    });
    await audit(req, { action: "CREATE", entityType: "Invoice", entityId: created.id, clientId: full.id, summary: `Draft invoice generated for ${full.name} - ${label}` }, tx);
    return created;
  });
  return getInvoice(invoice.id);
}

/** Generates drafts for every active client with recurring billing; skips clients already billed for the month. */
export async function generateMonthly(req: Request, billingPeriod: string, issueDate: Date | null) {
  const clients = await prisma.client.findMany({
    where: {
      archivedAt: null,
      status: "ACTIVE",
      OR: [{ services: { some: { isActive: true, isRecurring: true } } }, { monthlyRetainer: { gt: 0 } }],
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const created: { clientId: string; clientName: string; invoiceId: string; total: string }[] = [];
  const skipped: { clientId: string; clientName: string; reason: string }[] = [];
  for (const client of clients) {
    try {
      const invoice = await generateFromRecurring(req, { clientId: client.id, billingPeriod, issueDate, allowDuplicate: false });
      created.push({ clientId: client.id, clientName: client.name, invoiceId: invoice.id, total: invoice.total.toFixed(2) });
    } catch (error) {
      skipped.push({ clientId: client.id, clientName: client.name, reason: error instanceof Error ? error.message : "Failed" });
    }
  }
  return { created, skipped };
}

async function findDraft(id: string) {
  const invoice = await prisma.invoice.findUnique({ where: { id } });
  if (!invoice) throw AppError.notFound("Invoice");
  if (invoice.status !== "DRAFT") throw AppError.badRequest("Only draft invoices can be edited. Use Revise to correct an issued invoice.");
  return invoice;
}

export async function updateDraft(req: Request, id: string, input: InvoiceInput) {
  const draft = await findDraft(id);
  if (draft.clientId !== input.clientId) throw AppError.badRequest("Change the client by creating a new invoice");
  await assertServicesBelongToClient(input.clientId, input.items);
  await assertNoDuplicatePeriod(input.clientId, input.billingPeriod, input.allowDuplicate, id);
  const client = await prisma.client.findUniqueOrThrow({ where: { id: input.clientId } });
  const { items, totals } = safeBuildItems(input.items);
  const dueDate = input.dueDate ?? (await defaultDueDate(input.clientId, input.issueDate));
  if (dueDate < input.issueDate) throw AppError.badRequest("Due date cannot be before the issue date");

  await prisma.$transaction(async (tx) => {
    await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });
    await tx.invoice.update({
      where: { id },
      data: {
        billingPeriod: input.billingPeriod,
        recurringKey: input.billingPeriod && draft.recurringKey?.endsWith(input.billingPeriod) ? draft.recurringKey : null,
        issueDate: input.issueDate,
        dueDate,
        templateId: input.templateId,
        notes: input.notes,
        terms: input.terms,
        ...billTo(client),
        ...totals,
        items: { create: items },
      },
    });
    await audit(req, { action: "UPDATE", entityType: "Invoice", entityId: id, clientId: input.clientId, summary: `Draft invoice updated (${totals.total.toFixed(2)})` }, tx);
  });
  return getInvoice(id);
}

export async function deleteDraft(req: Request, id: string) {
  const draft = await findDraft(id);
  await prisma.$transaction(async (tx) => {
    await tx.invoice.delete({ where: { id } });
    await audit(req, { action: "DELETE", entityType: "Invoice", entityId: id, clientId: draft.clientId, summary: `Draft invoice for ${draft.billToName} deleted` }, tx);
  });
}

// ---------------------------------------------------------------------------
// Issue, correct, cancel
// ---------------------------------------------------------------------------

async function companySnapshot(tx: Tx) {
  const s = await tx.companySettings.findUniqueOrThrow({ where: { id: 1 } });
  return {
    legalName: s.legalName,
    tradingName: s.tradingName,
    addressLine1: s.addressLine1,
    addressLine2: s.addressLine2,
    city: s.city,
    state: s.state,
    postalCode: s.postalCode,
    country: s.country,
    email: s.email,
    phone: s.phone,
    website: s.website,
    pan: s.pan,
    isGstRegistered: s.isGstRegistered,
    gstin: s.gstin,
    taxLabel: s.taxLabel,
    splitTaxOnInvoice: s.splitTaxOnInvoice,
    otherTaxInfo: s.otherTaxInfo,
    bankName: s.bankName,
    bankAccountName: s.bankAccountName,
    bankAccountNumber: s.bankAccountNumber,
    bankIfsc: s.bankIfsc,
    bankBranch: s.bankBranch,
    upiId: s.upiId,
  };
}

export type CompanySnapshot = Awaited<ReturnType<typeof companySnapshot>>;

async function nextInvoiceNumber(tx: Tx, issueDate: Date) {
  const settings = await tx.companySettings.findUniqueOrThrow({ where: { id: 1 } });
  const fy = settings.invoiceUseFinancialYear ? financialYear(issueDate) : null;
  const sequence = await nextSequence(tx, fy ? `invoice:${fy}` : "invoice");
  const number = String(sequence).padStart(settings.invoiceNumberPadding, "0");
  return [settings.invoicePrefix, fy, number].filter(Boolean).join("-");
}

/** Locks totals: assigns the sequential number and freezes company details. */
export async function issueInvoice(req: Request, id: string) {
  const draft = await findDraft(id);
  if (money(draft.total).lessThanOrEqualTo(0)) throw AppError.badRequest("An invoice must have a total greater than zero to be issued");
  await prisma.$transaction(async (tx) => {
    const settings = await tx.companySettings.findUniqueOrThrow({ where: { id: 1 } });
    if (!settings.legalName || settings.legalName === "Your Agency Name") {
      throw AppError.badRequest("Set your company's legal name in Settings > Company before issuing invoices");
    }
    const invoiceNumber = await nextInvoiceNumber(tx, draft.issueDate);
    await tx.invoice.update({
      where: { id },
      data: {
        invoiceNumber,
        status: deriveStatus(draft.total, draft.amountPaid, draft.dueDate),
        issuedAt: new Date(),
        templateId: draft.templateId ?? settings.activeTemplateId,
        companySnapshot: await companySnapshot(tx),
      },
    });
    await audit(req, { action: "ISSUE", entityType: "Invoice", entityId: id, clientId: draft.clientId, summary: `Invoice ${invoiceNumber} issued (${draft.total.toFixed(2)})` }, tx);
  });
  return getInvoice(id);
}

/** Only non-financial fields may change after issue. */
export async function updateIssued(req: Request, id: string, input: z.infer<typeof issuedUpdateSchema>) {
  const invoice = await prisma.invoice.findUnique({ where: { id } });
  if (!invoice) throw AppError.notFound("Invoice");
  if (!OPEN_STATUSES.includes(invoice.status) && invoice.status !== "PAID") throw AppError.badRequest("This invoice cannot be changed");
  if (input.dueDate < invoice.issueDate) throw AppError.badRequest("Due date cannot be before the issue date");
  await prisma.$transaction(async (tx) => {
    await tx.invoice.update({
      where: { id },
      data: { ...input, status: invoice.status === "PAID" ? "PAID" : deriveStatus(invoice.total, invoice.amountPaid, input.dueDate) },
    });
    await audit(req, {
      action: "UPDATE",
      entityType: "Invoice",
      entityId: id,
      clientId: invoice.clientId,
      summary: `Invoice ${invoice.invoiceNumber} details updated (due date / notes / terms)`,
      changes: { dueDate: { from: invoice.dueDate.toISOString().slice(0, 10), to: input.dueDate.toISOString().slice(0, 10) } },
    }, tx);
  });
  return getInvoice(id);
}

async function assertCancellable(id: string) {
  const invoice = await prisma.invoice.findUnique({ where: { id } });
  if (!invoice) throw AppError.notFound("Invoice");
  if (!OPEN_STATUSES.includes(invoice.status)) throw AppError.badRequest("Only issued, unpaid invoices can be cancelled or revised");
  if (money(invoice.amountPaid).greaterThan(0)) {
    throw AppError.badRequest("This invoice has recorded payments. Void those payments first, then cancel or revise.");
  }
  return invoice;
}

export async function cancelInvoice(req: Request, id: string, reason: string) {
  const invoice = await assertCancellable(id);
  await prisma.$transaction(async (tx) => {
    await tx.invoice.update({ where: { id }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason, recurringKey: null } });
    await audit(req, { action: "CANCEL", entityType: "Invoice", entityId: id, clientId: invoice.clientId, summary: `Invoice ${invoice.invoiceNumber} cancelled: ${reason}` }, tx);
  });
  return getInvoice(id);
}

/**
 * Controlled correction: cancels the issued invoice (number retained for the audit trail) and creates an
 * editable draft copy linked to it. The draft gets a new number when issued.
 */
export async function reviseInvoice(req: Request, id: string, reason: string) {
  const original = await assertCancellable(id);
  const items = await prisma.invoiceItem.findMany({ where: { invoiceId: id }, orderBy: { sortOrder: "asc" } });
  const draft = await prisma.$transaction(async (tx) => {
    await tx.invoice.update({ where: { id }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: `Revised: ${reason}`, recurringKey: null } });
    const copy = await tx.invoice.create({
      data: {
        clientId: original.clientId,
        billingPeriod: original.billingPeriod,
        recurringKey: original.recurringKey,
        issueDate: todayUtc(),
        dueDate: addDays(todayUtc(), Math.max(0, Math.round((original.dueDate.getTime() - original.issueDate.getTime()) / 86_400_000))),
        templateId: original.templateId,
        currency: original.currency,
        billToName: original.billToName,
        billToAddress: original.billToAddress,
        billToEmail: original.billToEmail,
        billToGstin: original.billToGstin,
        billToPan: original.billToPan,
        subtotal: original.subtotal,
        discountTotal: original.discountTotal,
        taxTotal: original.taxTotal,
        total: original.total,
        notes: original.notes,
        terms: original.terms,
        revisedFromId: id,
        createdById: req.user?.id,
        items: {
          create: items.map(({ id: _id, invoiceId: _invoiceId, ...item }) => item),
        },
      },
    });
    await audit(req, { action: "REVISE", entityType: "Invoice", entityId: id, clientId: original.clientId, summary: `Invoice ${original.invoiceNumber} cancelled for revision: ${reason}` }, tx);
    return copy;
  });
  return getInvoice(draft.id);
}
