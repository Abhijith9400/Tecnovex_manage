/**
 * Content calendars: a client's plan for a month, either an uploaded file or a PDF generated from the app
 * calendar each time it is opened (so it always matches the calendar). Shared ones appear in the client portal.
 */
import type { Request, Response } from "express";
import type { z } from "zod";
import { prisma, type Prisma } from "../db/prisma";
import { AppError } from "../utils/AppError";
import { sendPdf } from "../utils/pdfResponse";
import type { contentCalendarSchema, contentCalendarUpdateSchema } from "../validators/contentCalendar.validators";
import { audit, diff } from "./audit.service";
import { deleteStoredFile, publicFile, storeUpload } from "./file.service";
import { planFor, renderContentCalendar } from "./pdf/contentCalendarPdf";
import { storage } from "./storage/storage";

const include = {
  client: { select: { id: true, name: true } },
  file: true,
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.ContentCalendarInclude;

type Row = Prisma.ContentCalendarGetPayload<{ include: typeof include }>;

function shape(row: Row) {
  const { file, ...rest } = row;
  return { ...rest, file: publicFile(file) };
}

/** Clients see only what they need; who made it and internal links are left out. */
function shapeForClient(row: Row) {
  return { id: row.id, period: row.period, title: row.title, notes: row.notes, kind: row.kind, file: publicFile(row.file), updatedAt: row.updatedAt };
}

async function find(id: string) {
  const row = await prisma.contentCalendar.findUnique({ where: { id }, include });
  if (!row) throw AppError.notFound("Content calendar");
  return row;
}

export async function listCalendars(query: { clientId?: string; period?: string }) {
  const rows = await prisma.contentCalendar.findMany({
    where: { ...(query.clientId ? { clientId: query.clientId } : {}), ...(query.period ? { period: query.period } : {}) },
    include,
    orderBy: [{ period: "desc" }, { createdAt: "desc" }],
  });
  return rows.map(shape);
}

export async function createCalendar(req: Request, input: z.infer<typeof contentCalendarSchema>, file?: Express.Multer.File) {
  const client = await prisma.client.findUnique({ where: { id: input.clientId } });
  if (!client) throw AppError.badRequest("Client not found");
  if (client.archivedAt) throw AppError.badRequest("This client is archived. Restore it first.");
  const created = await prisma.$transaction(async (tx) => {
    const stored = file ? await storeUpload(file, "CONTENT_CALENDAR", req.user?.id, {}, tx) : null;
    const row = await tx.contentCalendar.create({
      data: { ...input, kind: stored ? "UPLOADED" : "GENERATED", fileId: stored?.id ?? null, createdById: req.user?.id },
    });
    await audit(
      req,
      {
        action: "CREATE",
        entityType: "ContentCalendar",
        entityId: row.id,
        clientId: row.clientId,
        summary: `Content calendar "${row.title}" (${row.period}) ${stored ? "uploaded" : "created from the calendar"}${row.sharedWithClient ? " and shared with the client" : ""}`,
      },
      tx,
    );
    return row;
  });
  return shape(await find(created.id));
}

export async function updateCalendar(req: Request, id: string, input: z.infer<typeof contentCalendarUpdateSchema>) {
  const before = await find(id);
  await prisma.$transaction(async (tx) => {
    await tx.contentCalendar.update({ where: { id }, data: input });
    await audit(req, { action: "UPDATE", entityType: "ContentCalendar", entityId: id, clientId: before.clientId, summary: `Content calendar "${input.title}" updated`, changes: diff(before, input) }, tx);
  });
  return shape(await find(id));
}

export async function deleteCalendar(req: Request, id: string) {
  const row = await find(id);
  await prisma.$transaction(async (tx) => {
    await tx.contentCalendar.delete({ where: { id } });
    await audit(req, { action: "DELETE", entityType: "ContentCalendar", entityId: id, clientId: row.clientId, summary: `Content calendar "${row.title}" (${row.period}) deleted` }, tx);
  });
  if (row.fileId) await deleteStoredFile(row.fileId);
}

/** The uploaded file, or the generated PDF rendered from the calendar right now. */
async function send(res: Response, row: Row, download: boolean) {
  if (row.kind === "UPLOADED") {
    if (!row.file) throw AppError.notFound("File");
    await storage.send(res, row.file.storageKey, { fileName: row.file.originalName, mimeType: row.file.mimeType, download });
    return;
  }
  const pdf = await renderContentCalendar({ clientId: row.clientId, clientName: row.client.name, period: row.period, title: row.title, notes: row.notes });
  sendPdf(res, pdf, `${row.client.name} content calendar ${row.period}.pdf`, download);
}

export async function sendCalendar(res: Response, id: string, download: boolean) {
  await send(res, await find(id), download);
}

/** What a generated calendar would contain, for the preview in the app. */
export function preview(clientId: string, period: string) {
  return planFor(clientId, period);
}

// --- client portal ---

export async function portalList(clientId: string) {
  const rows = await prisma.contentCalendar.findMany({ where: { clientId, sharedWithClient: true }, include, orderBy: [{ period: "desc" }, { createdAt: "desc" }] });
  return rows.map(shapeForClient);
}

export async function portalSend(res: Response, clientId: string, id: string, download: boolean) {
  const row = await prisma.contentCalendar.findFirst({ where: { id, clientId, sharedWithClient: true }, include });
  // Not shared or another client's: looks like it does not exist.
  if (!row) throw AppError.notFound("Content calendar");
  await send(res, row, download);
}
