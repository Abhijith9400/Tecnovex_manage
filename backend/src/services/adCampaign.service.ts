import type { Request } from "express";
import type { z } from "zod";
import { prisma, type Prisma } from "../db/prisma";
import { AppError } from "../utils/AppError";
import { money } from "../utils/money";
import type { adCampaignListQuery, adCampaignSchema } from "../validators/ads.validators";
import { audit, diff } from "./audit.service";
import { assertClientUsable } from "./client.service";

const include = {
  client: { select: { id: true, name: true } },
  project: { select: { id: true, name: true } },
  creative: {
    select: { id: true, title: true, contentType: true, files: { orderBy: { sortOrder: "asc" }, take: 1, select: { id: true, originalName: true, mimeType: true, sizeBytes: true } } },
  },
  managedBy: { select: { name: true } },
} satisfies Prisma.AdCampaignInclude;

/** Ratio metrics, computed on the server from stored totals. null when the denominator is zero. */
export function adMetrics(c: { spend: Prisma.Decimal | string; budget?: Prisma.Decimal | string | null; impressions: number; clicks: number; results: number }) {
  const spend = money(c.spend);
  return {
    ctr: c.impressions > 0 ? ((c.clicks / c.impressions) * 100).toFixed(2) : null,
    cpc: c.clicks > 0 ? spend.dividedBy(c.clicks).toFixed(2) : null,
    cpm: c.impressions > 0 ? spend.dividedBy(c.impressions).times(1000).toFixed(2) : null,
    costPerResult: c.results > 0 ? spend.dividedBy(c.results).toFixed(2) : null,
    budgetUsed: c.budget && money(c.budget).greaterThan(0) ? spend.dividedBy(c.budget).times(100).toFixed(1) : null,
  };
}

function shape<T extends Prisma.AdCampaignGetPayload<{ include: typeof include }>>(c: T) {
  return { ...c, metrics: adMetrics(c) };
}

/** Campaigns that ran at any point within the range (start ≤ to and (no end or end ≥ from)). */
export function overlapWhere(from?: Date, to?: Date): Prisma.AdCampaignWhereInput {
  return {
    ...(to ? { startDate: { lte: to } } : {}),
    ...(from ? { OR: [{ endDate: null }, { endDate: { gte: from } }] } : {}),
  };
}

export function buildWhere(query: z.infer<typeof adCampaignListQuery>): Prisma.AdCampaignWhereInput {
  return {
    AND: [
      overlapWhere(query.from, query.to),
      query.clientId ? { clientId: query.clientId } : {},
      query.platform ? { platform: query.platform } : {},
      query.campaignType ? { campaignType: query.campaignType } : {},
      query.status ? { status: query.status } : {},
      query.creativeId ? { creativeId: query.creativeId } : {},
      query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: "insensitive" } },
              { objective: { contains: query.search, mode: "insensitive" } },
              { externalId: { contains: query.search, mode: "insensitive" } },
              { client: { name: { contains: query.search, mode: "insensitive" } } },
            ],
          }
        : {},
    ],
  };
}

export async function listCampaigns(query: z.infer<typeof adCampaignListQuery>, all = false) {
  const where = buildWhere(query);
  const [items, total, totals] = await prisma.$transaction([
    prisma.adCampaign.findMany({
      where,
      include,
      orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
      skip: all ? 0 : (query.page - 1) * query.pageSize,
      take: all ? 10_000 : query.pageSize,
    }),
    prisma.adCampaign.count({ where }),
    prisma.adCampaign.aggregate({ where, _sum: { spend: true, impressions: true, reach: true, clicks: true, results: true } }),
  ]);
  const sums = { spend: money(totals._sum.spend).toFixed(2), impressions: totals._sum.impressions ?? 0, reach: totals._sum.reach ?? 0, clicks: totals._sum.clicks ?? 0, results: totals._sum.results ?? 0 };
  return { items: items.map(shape), total, totals: { ...sums, ...adMetrics(sums) } };
}

/** Creatives of one client for the "boosted creative" picker (newest first, archived last). */
export function creativeOptions(clientId: string) {
  return prisma.creativeAsset.findMany({
    where: { clientId },
    select: {
      id: true,
      title: true,
      contentType: true,
      status: true,
      campaign: true,
      createdAt: true,
      files: { orderBy: { sortOrder: "asc" }, take: 1, select: { id: true, originalName: true, mimeType: true, sizeBytes: true } },
    },
    orderBy: [{ createdAt: "desc" }],
    take: 300,
  });
}

export async function getCampaign(id: string) {
  const campaign = await prisma.adCampaign.findUnique({ where: { id }, include });
  if (!campaign) throw AppError.notFound("Campaign");
  return shape(campaign);
}

async function assertLinks(input: z.infer<typeof adCampaignSchema>) {
  if (input.projectId && !(await prisma.project.findFirst({ where: { id: input.projectId, clientId: input.clientId } }))) {
    throw AppError.badRequest("Project does not belong to this client");
  }
  if (input.creativeId && !(await prisma.creativeAsset.findFirst({ where: { id: input.creativeId, clientId: input.clientId } }))) {
    throw AppError.badRequest("Creative does not belong to this client");
  }
}

export async function createCampaign(req: Request, input: z.infer<typeof adCampaignSchema>) {
  const client = await assertClientUsable(input.clientId);
  await assertLinks(input);
  const created = await prisma.$transaction(async (tx) => {
    const campaign = await tx.adCampaign.create({ data: { ...input, managedById: req.user?.id } });
    await audit(req, { action: "CREATE", entityType: "AdCampaign", entityId: campaign.id, clientId: input.clientId, summary: `Ad campaign "${campaign.name}" added for ${client.name}` }, tx);
    return campaign;
  });
  return getCampaign(created.id);
}

export async function updateCampaign(req: Request, id: string, input: z.infer<typeof adCampaignSchema>) {
  const before = await prisma.adCampaign.findUnique({ where: { id } });
  if (!before) throw AppError.notFound("Campaign");
  if (before.clientId !== input.clientId) throw AppError.badRequest("A campaign cannot be moved to a different client");
  await assertLinks(input);
  await prisma.$transaction(async (tx) => {
    await tx.adCampaign.update({ where: { id }, data: input });
    await audit(req, { action: "UPDATE", entityType: "AdCampaign", entityId: id, clientId: input.clientId, summary: `Ad campaign "${input.name}" updated`, changes: diff(before, input) }, tx);
  });
  return getCampaign(id);
}

export async function deleteCampaign(req: Request, id: string) {
  const campaign = await prisma.adCampaign.findUnique({ where: { id } });
  if (!campaign) throw AppError.notFound("Campaign");
  await prisma.$transaction(async (tx) => {
    await tx.adCampaign.delete({ where: { id } });
    await audit(req, { action: "DELETE", entityType: "AdCampaign", entityId: id, clientId: campaign.clientId, summary: `Ad campaign "${campaign.name}" deleted (spend ${campaign.spend.toFixed(2)})` }, tx);
  });
}
