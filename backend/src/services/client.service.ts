import type { Request } from "express";
import type { z } from "zod";
import { prisma, type Prisma } from "../db/prisma";
import { AppError } from "../utils/AppError";
import { money, sum } from "../utils/money";
import type { clientListQuery, clientSchema, serviceSchema } from "../validators/client.validators";
import { audit, diff } from "./audit.service";

type ClientInput = z.infer<typeof clientSchema>;

export async function listClients(query: z.infer<typeof clientListQuery>) {
  const where: Prisma.ClientWhereInput = {
    archivedAt: query.archived ? { not: null } : null,
    ...(query.status ? { status: query.status } : {}),
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: "insensitive" } },
            { contactPerson: { contains: query.search, mode: "insensitive" } },
            { email: { contains: query.search, mode: "insensitive" } },
            { phone: { contains: query.search } },
          ],
        }
      : {}),
  };
  const [items, total] = await prisma.$transaction([
    prisma.client.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: { _count: { select: { invoices: true, creatives: true, agreements: true, projects: true } } },
    }),
    prisma.client.count({ where }),
  ]);
  return { items, total };
}

/** Lightweight id/name list for dropdowns. */
export function clientOptions(includeArchived = false) {
  return prisma.client.findMany({
    where: includeArchived ? {} : { archivedAt: null },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export async function getClient(id: string) {
  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      services: { orderBy: [{ isActive: "desc" }, { createdAt: "asc" }] },
      _count: { select: { invoices: true, creatives: true, agreements: true, projects: true } },
    },
  });
  if (!client) throw AppError.notFound("Client");
  return client;
}

export async function assertClientUsable(id: string) {
  const client = await prisma.client.findUnique({ where: { id }, select: { id: true, archivedAt: true, name: true } });
  if (!client) throw AppError.badRequest("Client not found");
  if (client.archivedAt) throw AppError.badRequest(`${client.name} is archived. Restore the client first.`);
  return client;
}

export async function createClient(req: Request, input: ClientInput) {
  return prisma.$transaction(async (tx) => {
    const client = await tx.client.create({ data: input });
    await audit(req, { action: "CREATE", entityType: "Client", entityId: client.id, clientId: client.id, summary: `Client "${client.name}" created` }, tx);
    return client;
  });
}

export async function updateClient(req: Request, id: string, input: ClientInput) {
  const before = await getClient(id);
  return prisma.$transaction(async (tx) => {
    const client = await tx.client.update({ where: { id }, data: input });
    await audit(req, { action: "UPDATE", entityType: "Client", entityId: id, clientId: id, summary: `Client "${client.name}" updated`, changes: diff(before, input) }, tx);
    return client;
  });
}

export async function setArchived(req: Request, id: string, archived: boolean) {
  const client = await getClient(id);
  return prisma.$transaction(async (tx) => {
    const updated = await tx.client.update({ where: { id }, data: { archivedAt: archived ? new Date() : null, ...(archived ? { status: "INACTIVE" } : {}) } });
    await audit(req, { action: archived ? "ARCHIVE" : "RESTORE", entityType: "Client", entityId: id, clientId: id, summary: `Client "${client.name}" ${archived ? "archived" : "restored"}` }, tx);
    return updated;
  });
}

/** Billing summary from saved invoices and recorded payments (no double counting). */
export async function clientSummary(id: string) {
  await getClient(id);
  const invoices = await prisma.invoice.findMany({
    where: { clientId: id, status: { notIn: ["DRAFT", "CANCELLED"] } },
    select: { total: true, amountPaid: true, status: true },
  });
  const payments = await prisma.payment.aggregate({ where: { clientId: id, status: "RECORDED" }, _sum: { amount: true } });
  const totalInvoiced = sum(invoices.map((i) => i.total));
  const outstanding = sum(invoices.map((i) => money(i.total).minus(i.amountPaid)));
  return {
    totalInvoiced: totalInvoiced.toFixed(2),
    totalPaid: money(payments._sum.amount).toFixed(2),
    outstanding: outstanding.toFixed(2),
    overdueCount: invoices.filter((i) => i.status === "OVERDUE").length,
  };
}

export async function clientActivity(id: string, page: number, pageSize: number) {
  await getClient(id);
  const where = { clientId: id };
  const [items, total] = await prisma.$transaction([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: { id: true, action: true, entityType: true, entityId: true, summary: true, createdAt: true, user: { select: { name: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);
  return { items, total };
}

// --- services (billable items per client) ---

export async function addService(req: Request, clientId: string, input: z.infer<typeof serviceSchema>) {
  const client = await getClient(clientId);
  return prisma.$transaction(async (tx) => {
    const service = await tx.service.create({ data: { ...input, clientId } });
    await audit(req, { action: "CREATE", entityType: "Service", entityId: service.id, clientId, summary: `Service "${service.name}" added to ${client.name}` }, tx);
    return service;
  });
}

export async function updateService(req: Request, clientId: string, serviceId: string, input: z.infer<typeof serviceSchema>) {
  const before = await prisma.service.findFirst({ where: { id: serviceId, clientId } });
  if (!before) throw AppError.notFound("Service");
  return prisma.$transaction(async (tx) => {
    const service = await tx.service.update({ where: { id: serviceId }, data: input });
    await audit(req, { action: "UPDATE", entityType: "Service", entityId: serviceId, clientId, summary: `Service "${service.name}" updated`, changes: diff(before, input) }, tx);
    return service;
  });
}

/** Services referenced by invoices are deactivated instead of deleted to keep history intact. */
export async function removeService(req: Request, clientId: string, serviceId: string) {
  const service = await prisma.service.findFirst({ where: { id: serviceId, clientId }, include: { _count: { select: { invoiceItems: true } } } });
  if (!service) throw AppError.notFound("Service");
  await prisma.$transaction(async (tx) => {
    if (service._count.invoiceItems > 0) {
      await tx.service.update({ where: { id: serviceId }, data: { isActive: false } });
    } else {
      await tx.service.delete({ where: { id: serviceId } });
    }
    await audit(req, { action: "DELETE", entityType: "Service", entityId: serviceId, clientId, summary: `Service "${service.name}" removed` }, tx);
  });
  return { deactivated: service._count.invoiceItems > 0 };
}
