import type { Request } from "express";
import type { z } from "zod";
import { Prisma, prisma } from "../db/prisma";
import { AppError } from "../utils/AppError";
import { money } from "../utils/money";
import type { paymentListQuery, paymentSchema } from "../validators/payment.validators";
import { audit } from "./audit.service";
import { deleteStoredFile, publicFile, storeUpload } from "./file.service";
import { deriveStatus } from "./invoice.service";
import { nextSequence } from "./sequence.service";

type PaymentInput = z.infer<typeof paymentSchema>;

const include = {
  client: { select: { id: true, name: true } },
  invoice: { select: { id: true, invoiceNumber: true } },
  proofFile: true,
  recordedBy: { select: { name: true } },
} satisfies Prisma.PaymentInclude;

type PaymentRow = Prisma.PaymentGetPayload<{ include: typeof include }>;

function shape({ proofFile, referenceKey: _key, idempotencyKey: _idem, ...payment }: PaymentRow) {
  return { ...payment, proof: publicFile(proofFile) };
}

/** Normalised "<METHOD>:<REF>" key; the unique index stops the same bank/UPI transaction being recorded twice. */
export function referenceKey(method: string, reference: string | null) {
  const normalised = reference?.replace(/\s+/g, "").toUpperCase();
  return normalised ? `${method}:${normalised}` : null;
}

export function buildListWhere(query: z.infer<typeof paymentListQuery>): Prisma.PaymentWhereInput {
  return {
    ...(query.clientId ? { clientId: query.clientId } : {}),
    ...(query.invoiceId ? { invoiceId: query.invoiceId } : {}),
    ...(query.method ? { method: query.method } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.from || query.to ? { paymentDate: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) } } : {}),
    ...(query.search
      ? {
          OR: [
            { receiptNumber: { contains: query.search, mode: "insensitive" } },
            { reference: { contains: query.search, mode: "insensitive" } },
            { client: { name: { contains: query.search, mode: "insensitive" } } },
            { invoice: { invoiceNumber: { contains: query.search, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
}

export async function listPayments(query: z.infer<typeof paymentListQuery>, all = false) {
  const where = buildListWhere(query);
  const [items, total] = await prisma.$transaction([
    prisma.payment.findMany({
      where,
      include,
      orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }],
      skip: all ? 0 : (query.page - 1) * query.pageSize,
      take: all ? 10_000 : query.pageSize,
    }),
    prisma.payment.count({ where }),
  ]);
  return { items: items.map(shape), total };
}

export async function getPayment(id: string) {
  const payment = await prisma.payment.findUnique({ where: { id }, include });
  if (!payment) throw AppError.notFound("Payment");
  return shape(payment);
}

/**
 * Records a payment and updates the invoice's paid amount and status atomically.
 * The invoice row is locked (SELECT ... FOR UPDATE) so concurrent payments cannot overpay it.
 */
/** `storedProofId` attaches a proof uploaded earlier (a manager's payment approved later). */
export async function recordPayment(req: Request, input: PaymentInput, proof?: Express.Multer.File, storedProofId?: string) {
  if (input.idempotencyKey) {
    const existing = await prisma.payment.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include });
    if (existing) return { payment: shape(existing), duplicateSubmission: true };
  }
  if (!input.invoiceId && !input.clientId) throw AppError.badRequest("Choose an invoice or a client");

  const refKey = referenceKey(input.method, input.reference);
  if (refKey) {
    const clash = await prisma.payment.findUnique({ where: { referenceKey: refKey }, select: { receiptNumber: true } });
    if (clash) throw AppError.conflict(`A payment with reference "${input.reference}" is already recorded (${clash.receiptNumber})`);
  }

  let created;
  try {
    created = await savePayment(req, input, refKey, proof, storedProofId);
  } catch (error) {
    // Two identical submissions raced past the check above: return the one that won.
    if (input.idempotencyKey && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await prisma.payment.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include });
      if (existing) return { payment: shape(existing), duplicateSubmission: true };
    }
    throw error;
  }

  return { payment: await getPayment(created.id), duplicateSubmission: false };
}

function savePayment(req: Request, input: PaymentInput, refKey: string | null, proof?: Express.Multer.File, storedProofId?: string) {
  return prisma.$transaction(async (tx) => {
    let clientId = input.clientId;
    if (input.invoiceId) {
      await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${input.invoiceId} FOR UPDATE`;
      const invoice = await tx.invoice.findUnique({ where: { id: input.invoiceId } });
      if (!invoice) throw AppError.badRequest("Invoice not found");
      if (input.clientId && input.clientId !== invoice.clientId) throw AppError.badRequest("The invoice belongs to a different client");
      if (!["ISSUED", "PARTIALLY_PAID", "OVERDUE"].includes(invoice.status)) {
        throw AppError.badRequest(invoice.status === "DRAFT" ? "Issue the invoice before recording payments" : `Cannot record a payment on a ${invoice.status.toLowerCase()} invoice`);
      }
      const balance = money(invoice.total).minus(invoice.amountPaid);
      if (money(input.amount).greaterThan(balance)) {
        throw AppError.badRequest(`Amount exceeds the outstanding balance of ${balance.toFixed(2)}`);
      }
      const amountPaid = money(invoice.amountPaid).plus(input.amount);
      await tx.invoice.update({
        where: { id: invoice.id },
        data: { amountPaid, status: deriveStatus(invoice.total, amountPaid, invoice.dueDate) },
      });
      clientId = invoice.clientId;
    } else {
      const client = await tx.client.findUnique({ where: { id: clientId! } });
      if (!client) throw AppError.badRequest("Client not found");
    }

    const settings = await tx.companySettings.findUniqueOrThrow({ where: { id: 1 } });
    const receiptNumber = `${settings.receiptPrefix}-${String(await nextSequence(tx, "receipt")).padStart(5, "0")}`;
    const proofFile = proof ? await storeUpload(proof, "PAYMENT_PROOF", req.user?.id, {}, tx) : null;

    const payment = await tx.payment.create({
      data: {
        receiptNumber,
        clientId: clientId!,
        invoiceId: input.invoiceId,
        paymentDate: input.paymentDate,
        amount: input.amount,
        method: input.method,
        reference: input.reference,
        referenceKey: refKey,
        idempotencyKey: input.idempotencyKey ?? null,
        notes: input.notes,
        proofFileId: proofFile?.id ?? storedProofId ?? null,
        recordedById: req.user?.id,
      },
    });
    await audit(req, { action: "CREATE", entityType: "Payment", entityId: payment.id, clientId, summary: `Payment ${receiptNumber} of ${money(input.amount).toFixed(2)} recorded` }, tx);
    return payment;
  });
}

/** Voiding is the only way to reverse a payment; the record stays for the audit trail. */
export async function voidPayment(req: Request, id: string, reason: string) {
  const payment = await prisma.payment.findUnique({ where: { id } });
  if (!payment) throw AppError.notFound("Payment");
  if (payment.status === "VOIDED") throw AppError.badRequest("This payment is already voided");

  await prisma.$transaction(async (tx) => {
    if (payment.invoiceId) {
      await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${payment.invoiceId} FOR UPDATE`;
      const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: payment.invoiceId } });
      const amountPaid = money(invoice.amountPaid).minus(payment.amount);
      if (amountPaid.isNegative()) throw AppError.badRequest("Invoice paid amount would become negative");
      await tx.invoice.update({
        where: { id: invoice.id },
        data: { amountPaid, status: invoice.status === "CANCELLED" ? "CANCELLED" : deriveStatus(invoice.total, amountPaid, invoice.dueDate) },
      });
    }
    await tx.payment.update({ where: { id }, data: { status: "VOIDED", voidedAt: new Date(), voidReason: reason, referenceKey: null } });
    await audit(req, { action: "VOID", entityType: "Payment", entityId: id, clientId: payment.clientId, summary: `Payment ${payment.receiptNumber} voided: ${reason}` }, tx);
  });
  return getPayment(id);
}

export async function replaceProof(req: Request, id: string, file: Express.Multer.File) {
  const payment = await prisma.payment.findUnique({ where: { id } });
  if (!payment) throw AppError.notFound("Payment");
  const stored = await storeUpload(file, "PAYMENT_PROOF", req.user?.id);
  await prisma.payment.update({ where: { id }, data: { proofFileId: stored.id } });
  if (payment.proofFileId) await deleteStoredFile(payment.proofFileId);
  await audit(req, { action: "UPDATE", entityType: "Payment", entityId: id, clientId: payment.clientId, summary: `Proof of payment attached to ${payment.receiptNumber}` });
  return getPayment(id);
}
