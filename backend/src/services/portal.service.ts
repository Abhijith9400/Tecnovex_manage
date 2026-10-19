/**
 * Client portal: a CLIENT login sees only its own client's approved/published creatives.
 * Internal notes, drafts, archived work and uploader details are never exposed.
 */
import path from "node:path";
import { ZipArchive } from "archiver";
import type { Request, Response } from "express";
import type { z } from "zod";
import { prisma, type Prisma } from "../db/prisma";
import { AppError } from "../utils/AppError";
import { monthEnd, monthStart, parsePeriod } from "../utils/dates";
import type { portalListQuery } from "../validators/portal.validators";
import { audit } from "./audit.service";
import { PORTAL_STATUSES, publicFile } from "./file.service";
import { storage } from "./storage/storage";

const select = {
  id: true,
  title: true,
  campaign: true,
  contentType: true,
  platform: true,
  status: true,
  publishDate: true,
  caption: true,
  createdAt: true,
  files: { orderBy: { sortOrder: "asc" } },
} satisfies Prisma.CreativeAssetSelect;

type PortalCreative = Prisma.CreativeAssetGetPayload<{ select: typeof select }>;

function shape(creative: PortalCreative) {
  return { ...creative, files: creative.files.map((f) => publicFile(f)!) };
}

export function portalClientId(req: Request): string {
  const clientId = req.user?.clientId;
  if (req.user?.role !== "CLIENT" || !clientId) throw AppError.forbidden("This login is not linked to a client");
  return clientId;
}

function baseWhere(clientId: string): Prisma.CreativeAssetWhereInput {
  return { clientId, status: { in: [...PORTAL_STATUSES] }, client: { archivedAt: null } };
}

export async function profile(clientId: string) {
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true, name: true } });
  if (!client) throw AppError.notFound("Client");
  const agency = await prisma.companySettings.findUnique({ where: { id: 1 }, select: { legalName: true, tradingName: true, logoFileId: true } });
  return { client, agencyName: agency?.tradingName || agency?.legalName || "" };
}

export async function listCreatives(clientId: string, query: z.infer<typeof portalListQuery>) {
  const and: Prisma.CreativeAssetWhereInput[] = [baseWhere(clientId)];
  if (query.platform) and.push({ platform: query.platform });
  if (query.contentType) and.push({ contentType: query.contentType });
  if (query.campaign) and.push({ campaign: { equals: query.campaign, mode: "insensitive" } });
  if (query.search) {
    and.push({ OR: [{ title: { contains: query.search, mode: "insensitive" } }, { campaign: { contains: query.search, mode: "insensitive" } }, { caption: { contains: query.search, mode: "insensitive" } }] });
  }
  if (query.month) {
    const { year, month } = parsePeriod(query.month);
    and.push({
      OR: [{ publishDate: { gte: monthStart(year, month), lte: monthEnd(year, month) } }, { publishDate: null, createdAt: { gte: monthStart(year, month), lt: new Date(Date.UTC(year, month, 1)) } }],
    });
  }
  const where = { AND: and };
  const [items, total] = await prisma.$transaction([
    prisma.creativeAsset.findMany({ where, select, orderBy: [{ publishDate: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
    prisma.creativeAsset.count({ where }),
  ]);
  return { items: items.map(shape), total };
}

export async function campaigns(clientId: string) {
  const rows = await prisma.creativeAsset.findMany({ where: { ...baseWhere(clientId), campaign: { not: null } }, distinct: ["campaign"], select: { campaign: true }, orderBy: { campaign: "asc" } });
  return rows.map((r) => r.campaign!);
}

async function findCreative(clientId: string, creativeId: string) {
  const creative = await prisma.creativeAsset.findFirst({ where: { id: creativeId, ...baseWhere(clientId) }, select });
  if (!creative) throw AppError.notFound("Creative");
  return creative;
}

export async function getCreative(clientId: string, creativeId: string) {
  return shape(await findCreative(clientId, creativeId));
}

/** Streams every original file of a creative as a ZIP (stored, not recompressed; media is already compressed). */
export async function downloadZip(req: Request, res: Response, clientId: string, creativeId: string) {
  const creative = await findCreative(clientId, creativeId);
  const zipName = `${creative.title.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "creative"}.zip`;

  // Open every stream before sending headers so a missing file still returns a clean 404.
  const used = new Set<string>();
  const entries = [];
  for (const [index, file] of creative.files.entries()) {
    let name = path.basename(file.originalName) || `file-${index + 1}`;
    if (used.has(name.toLowerCase())) name = `${index + 1}-${name}`;
    used.add(name.toLowerCase());
    entries.push({ name, stream: await storage.stream(file.storageKey) });
  }

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${zipName}"`);
  res.setHeader("Cache-Control", "private, no-store");

  const archive = new ZipArchive({ store: true });
  archive.on("error", (error: Error) => res.destroy(error));
  archive.pipe(res);
  for (const entry of entries) archive.append(entry.stream, { name: entry.name });
  await archive.finalize();

  await audit(req, { action: "DOWNLOAD", entityType: "CreativeAsset", entityId: creative.id, clientId, summary: `Client portal: "${creative.title}" downloaded (${entries.length} file(s))` });
}
