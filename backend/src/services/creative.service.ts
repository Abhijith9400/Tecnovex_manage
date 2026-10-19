import type { Request } from "express";
import type { z } from "zod";
import { prisma, type Prisma } from "../db/prisma";
import { AppError } from "../utils/AppError";
import { monthEnd, monthStart, parsePeriod } from "../utils/dates";
import { sum } from "../utils/money";
import type { creativeListQuery, creativeSchema } from "../validators/creative.validators";
import { audit, diff } from "./audit.service";
import { assertClientUsable } from "./client.service";
import { deleteStoredFile, publicFile, storeUpload } from "./file.service";

const include = {
  client: { select: { id: true, name: true } },
  project: { select: { id: true, name: true } },
  uploadedBy: { select: { name: true } },
  files: { orderBy: { sortOrder: "asc" } },
  adCampaigns: {
    where: { status: { not: "CANCELLED" } },
    orderBy: { startDate: "desc" },
    select: { id: true, name: true, platform: true, campaignType: true, status: true, startDate: true, endDate: true, spend: true, impressions: true, reach: true, clicks: true, results: true, resultLabel: true },
  },
} satisfies Prisma.CreativeAssetInclude;

type CreativeWithFiles = Prisma.CreativeAssetGetPayload<{ include: typeof include }>;

/** Adds a boost summary (count, total spend, results) from linked, non-cancelled ad campaigns. */
function shape(creative: CreativeWithFiles) {
  const { adCampaigns, ...rest } = creative;
  return {
    ...rest,
    files: creative.files.map((f) => publicFile(f)!),
    boosts: adCampaigns,
    boostSummary: {
      count: adCampaigns.length,
      spend: sum(adCampaigns.map((c) => c.spend)).toFixed(2),
      impressions: adCampaigns.reduce((a, c) => a + c.impressions, 0),
      results: adCampaigns.reduce((a, c) => a + c.results, 0),
    },
  };
}

export async function listCreatives(query: z.infer<typeof creativeListQuery>) {
  const where: Prisma.CreativeAssetWhereInput = {
    ...(query.clientId ? { clientId: query.clientId } : {}),
    ...(query.platform ? { platform: query.platform } : {}),
    ...(query.contentType ? { contentType: query.contentType } : {}),
    ...(query.status ? { status: query.status } : { status: { not: "ARCHIVED" } }),
    ...(query.campaign ? { campaign: { equals: query.campaign, mode: "insensitive" } } : {}),
    AND: [],
  };
  const and = where.AND as Prisma.CreativeAssetWhereInput[];
  if (query.search) {
    and.push({
      OR: [
        { title: { contains: query.search, mode: "insensitive" } },
        { campaign: { contains: query.search, mode: "insensitive" } },
        { caption: { contains: query.search, mode: "insensitive" } },
      ],
    });
  }
  if (query.month) {
    // A creative belongs to a month by its publication date, or its upload date if unpublished.
    const { year, month } = parsePeriod(query.month);
    const start = monthStart(year, month);
    const end = monthEnd(year, month);
    const nextMonth = new Date(Date.UTC(year, month, 1));
    and.push({
      OR: [{ publishDate: { gte: start, lte: end } }, { publishDate: null, createdAt: { gte: start, lt: nextMonth } }],
    });
  }

  const [items, total] = await prisma.$transaction([
    prisma.creativeAsset.findMany({ where, include, orderBy: { createdAt: "desc" }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
    prisma.creativeAsset.count({ where }),
  ]);
  return { items: items.map(shape), total };
}

export async function campaigns(clientId?: string) {
  const rows = await prisma.creativeAsset.findMany({
    where: { campaign: { not: null }, ...(clientId ? { clientId } : {}) },
    distinct: ["campaign"],
    select: { campaign: true },
    orderBy: { campaign: "asc" },
  });
  return rows.map((r) => r.campaign!);
}

async function findCreative(clientId: string, creativeId: string) {
  const creative = await prisma.creativeAsset.findFirst({ where: { id: creativeId, clientId }, include });
  if (!creative) throw AppError.notFound("Creative");
  return creative;
}

export async function getCreative(clientId: string, creativeId: string) {
  return shape(await findCreative(clientId, creativeId));
}

async function assertProject(clientId: string, projectId: string | null) {
  if (projectId && !(await prisma.project.findFirst({ where: { id: projectId, clientId } }))) {
    throw AppError.badRequest("Project does not belong to this client");
  }
}

export async function createCreative(req: Request, clientId: string, input: z.infer<typeof creativeSchema>, files: Express.Multer.File[]) {
  const client = await assertClientUsable(clientId);
  if (files.length === 0) throw AppError.badRequest("Upload at least one file");
  await assertProject(clientId, input.projectId);

  const creative = await prisma.creativeAsset.create({ data: { ...input, clientId, uploadedById: req.user?.id } });
  try {
    for (const [index, file] of files.entries()) {
      await storeUpload(file, "CREATIVE", req.user?.id, { creativeAssetId: creative.id, sortOrder: index });
    }
  } catch (error) {
    await removeCreativeRecord(creative.id);
    throw error;
  }
  await audit(req, { action: "CREATE", entityType: "CreativeAsset", entityId: creative.id, clientId, summary: `Creative "${creative.title}" uploaded for ${client.name} (${files.length} file${files.length > 1 ? "s" : ""})` });
  return getCreative(clientId, creative.id);
}

export async function updateCreative(req: Request, clientId: string, creativeId: string, input: z.infer<typeof creativeSchema>) {
  const before = await findCreative(clientId, creativeId);
  await assertProject(clientId, input.projectId);
  await prisma.creativeAsset.update({ where: { id: creativeId }, data: input });
  await audit(req, {
    action: before.status !== input.status ? "STATUS_CHANGE" : "UPDATE",
    entityType: "CreativeAsset",
    entityId: creativeId,
    clientId,
    summary: before.status !== input.status ? `Creative "${input.title}" marked ${input.status.toLowerCase()}` : `Creative "${input.title}" updated`,
    changes: diff(before, input),
  });
  return getCreative(clientId, creativeId);
}

export async function addFiles(req: Request, clientId: string, creativeId: string, files: Express.Multer.File[]) {
  const creative = await findCreative(clientId, creativeId);
  if (files.length === 0) throw AppError.badRequest("Choose at least one file");
  if (creative.files.length + files.length > 20) throw AppError.badRequest("A creative can hold at most 20 files");
  const start = creative.files.reduce((max, f) => Math.max(max, f.sortOrder + 1), 0);
  for (const [index, file] of files.entries()) {
    await storeUpload(file, "CREATIVE", req.user?.id, { creativeAssetId: creativeId, sortOrder: start + index });
  }
  await audit(req, { action: "UPDATE", entityType: "CreativeAsset", entityId: creativeId, clientId, summary: `${files.length} file(s) added to "${creative.title}"` });
  return getCreative(clientId, creativeId);
}

export async function removeFile(req: Request, clientId: string, creativeId: string, fileId: string) {
  const creative = await findCreative(clientId, creativeId);
  const file = creative.files.find((f) => f.id === fileId);
  if (!file) throw AppError.notFound("File");
  if (creative.files.length === 1) throw AppError.badRequest("A creative needs at least one file. Delete the creative instead.");
  await deleteStoredFile(fileId);
  await audit(req, { action: "UPDATE", entityType: "CreativeAsset", entityId: creativeId, clientId, summary: `File "${file.originalName}" removed from "${creative.title}"` });
  return getCreative(clientId, creativeId);
}

async function removeCreativeRecord(creativeId: string) {
  const files = await prisma.storedFile.findMany({ where: { creativeAssetId: creativeId }, select: { id: true } });
  for (const file of files) await deleteStoredFile(file.id);
  await prisma.creativeAsset.delete({ where: { id: creativeId } });
}

export async function deleteCreative(req: Request, clientId: string, creativeId: string) {
  const creative = await findCreative(clientId, creativeId);
  await removeCreativeRecord(creativeId);
  await audit(req, { action: "DELETE", entityType: "CreativeAsset", entityId: creativeId, clientId, summary: `Creative "${creative.title}" deleted` });
}
