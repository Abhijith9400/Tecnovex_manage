import type { Request } from "express";
import type { z } from "zod";
import { prisma, type Prisma } from "../db/prisma";
import { AppError } from "../utils/AppError";
import { addDays, todayUtc } from "../utils/dates";
import type { agreementListQuery, agreementSchema } from "../validators/agreement.validators";
import { audit, diff } from "./audit.service";
import { assertClientUsable } from "./client.service";
import { deleteStoredFile, publicFile, storeUpload } from "./file.service";

const include = {
  client: { select: { id: true, name: true } },
  documents: { orderBy: { createdAt: "asc" } },
} satisfies Prisma.ClientAgreementInclude;

type AgreementRow = Prisma.ClientAgreementGetPayload<{ include: typeof include }>;

/** Renewal tracking derived from the expiry date and the agreement's reminder window. */
export function renewalState(expiryDate: Date | null, reminderDays: number, today = todayUtc()) {
  if (!expiryDate) return { daysToExpiry: null, state: "NO_EXPIRY" as const };
  const daysToExpiry = Math.round((expiryDate.getTime() - today.getTime()) / 86_400_000);
  const state = daysToExpiry < 0 ? ("EXPIRED" as const) : daysToExpiry <= reminderDays ? ("DUE_SOON" as const) : ("OK" as const);
  return { daysToExpiry, state };
}

function shape(agreement: AgreementRow) {
  return {
    ...agreement,
    documents: agreement.documents.map((d) => ({ ...publicFile(d)!, label: d.label })),
    renewal: renewalState(agreement.expiryDate, agreement.renewalReminderDays),
  };
}

export async function listAgreements(query: z.infer<typeof agreementListQuery>) {
  const today = todayUtc();
  const where: Prisma.ClientAgreementWhereInput = {
    archivedAt: query.archived ? { not: null } : null,
    ...(query.clientId ? { clientId: query.clientId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.renewal === "EXPIRED" ? { expiryDate: { lt: today } } : {}),
    // DUE_SOON uses a 90-day window at query time; each row's own reminder window is applied below.
    ...(query.renewal === "DUE_SOON" ? { expiryDate: { gte: today, lte: addDays(today, 90) }, status: { notIn: ["TERMINATED", "EXPIRED"] } } : {}),
    ...(query.search
      ? {
          OR: [
            { title: { contains: query.search, mode: "insensitive" } },
            { reference: { contains: query.search, mode: "insensitive" } },
            { client: { name: { contains: query.search, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const orderBy: Prisma.ClientAgreementOrderByWithRelationInput[] = [{ expiryDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }];
  const skip = (query.page - 1) * query.pageSize;

  if (query.renewal === "DUE_SOON") {
    // Bounded by the 90-day window, so filter per-row reminder windows in memory, then paginate.
    const due = (await prisma.clientAgreement.findMany({ where, include, orderBy })).map(shape).filter((a) => a.renewal.state === "DUE_SOON");
    return { items: due.slice(skip, skip + query.pageSize), total: due.length };
  }

  const [rows, total] = await prisma.$transaction([
    prisma.clientAgreement.findMany({ where, include, orderBy, skip, take: query.pageSize }),
    prisma.clientAgreement.count({ where }),
  ]);
  return { items: rows.map(shape), total };
}

async function find(id: string) {
  const agreement = await prisma.clientAgreement.findUnique({ where: { id }, include });
  if (!agreement) throw AppError.notFound("Agreement");
  return agreement;
}

export async function getAgreement(id: string) {
  return shape(await find(id));
}

export async function createAgreement(req: Request, input: z.infer<typeof agreementSchema>) {
  const client = await assertClientUsable(input.clientId);
  const agreement = await prisma.$transaction(async (tx) => {
    const created = await tx.clientAgreement.create({ data: input });
    await audit(req, { action: "CREATE", entityType: "ClientAgreement", entityId: created.id, clientId: input.clientId, summary: `Agreement "${created.title}" created for ${client.name}` }, tx);
    return created;
  });
  return getAgreement(agreement.id);
}

export async function updateAgreement(req: Request, id: string, input: z.infer<typeof agreementSchema>) {
  const before = await find(id);
  if (before.clientId !== input.clientId) throw AppError.badRequest("An agreement cannot be moved to a different client");
  await prisma.$transaction(async (tx) => {
    await tx.clientAgreement.update({ where: { id }, data: input });
    await audit(req, { action: "UPDATE", entityType: "ClientAgreement", entityId: id, clientId: input.clientId, summary: `Agreement "${input.title}" updated`, changes: diff(before, input) }, tx);
  });
  return getAgreement(id);
}

export async function setArchived(req: Request, id: string, archived: boolean) {
  const agreement = await find(id);
  await prisma.$transaction(async (tx) => {
    await tx.clientAgreement.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
    await audit(req, { action: archived ? "ARCHIVE" : "RESTORE", entityType: "ClientAgreement", entityId: id, clientId: agreement.clientId, summary: `Agreement "${agreement.title}" ${archived ? "archived" : "restored"}` }, tx);
  });
  return getAgreement(id);
}

export async function addDocuments(req: Request, id: string, files: Express.Multer.File[], label: string | null) {
  const agreement = await find(id);
  if (files.length === 0) throw AppError.badRequest("Choose at least one document");
  for (const file of files) await storeUpload(file, "AGREEMENT", req.user?.id, { agreementId: id, label });
  await audit(req, { action: "UPDATE", entityType: "ClientAgreement", entityId: id, clientId: agreement.clientId, summary: `${files.length} document(s) attached to "${agreement.title}"` });
  return getAgreement(id);
}

export async function removeDocument(req: Request, id: string, fileId: string) {
  const agreement = await find(id);
  const doc = agreement.documents.find((d) => d.id === fileId);
  if (!doc) throw AppError.notFound("Document");
  await deleteStoredFile(fileId);
  await audit(req, { action: "UPDATE", entityType: "ClientAgreement", entityId: id, clientId: agreement.clientId, summary: `Document "${doc.originalName}" removed from "${agreement.title}"` });
  return getAgreement(id);
}
