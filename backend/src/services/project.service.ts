import type { Request } from "express";
import type { z } from "zod";
import { prisma, type Prisma } from "../db/prisma";
import { AppError } from "../utils/AppError";
import type { projectListQuery, projectSchema } from "../validators/agreement.validators";
import { audit, diff } from "./audit.service";
import { assertClientUsable } from "./client.service";

const include = {
  client: { select: { id: true, name: true } },
  agreement: { select: { id: true, title: true } },
  _count: { select: { creatives: true } },
} satisfies Prisma.ProjectInclude;

export async function listProjects(query: z.infer<typeof projectListQuery>) {
  const where: Prisma.ProjectWhereInput = {
    ...(query.clientId ? { clientId: query.clientId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.search
      ? { OR: [{ name: { contains: query.search, mode: "insensitive" } }, { client: { name: { contains: query.search, mode: "insensitive" } } }] }
      : {}),
  };
  const [items, total] = await prisma.$transaction([
    prisma.project.findMany({ where, include, orderBy: [{ status: "asc" }, { createdAt: "desc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
    prisma.project.count({ where }),
  ]);
  return { items, total };
}

export async function getProject(id: string) {
  const project = await prisma.project.findUnique({ where: { id }, include });
  if (!project) throw AppError.notFound("Project");
  return project;
}

async function assertAgreement(clientId: string, agreementId: string | null) {
  if (agreementId && !(await prisma.clientAgreement.findFirst({ where: { id: agreementId, clientId } }))) {
    throw AppError.badRequest("Agreement does not belong to this client");
  }
}

export async function createProject(req: Request, input: z.infer<typeof projectSchema>) {
  const client = await assertClientUsable(input.clientId);
  await assertAgreement(input.clientId, input.agreementId);
  const project = await prisma.$transaction(async (tx) => {
    const created = await tx.project.create({ data: input });
    await audit(req, { action: "CREATE", entityType: "Project", entityId: created.id, clientId: input.clientId, summary: `Project "${created.name}" created for ${client.name}` }, tx);
    return created;
  });
  return getProject(project.id);
}

export async function updateProject(req: Request, id: string, input: z.infer<typeof projectSchema>) {
  const before = await getProject(id);
  if (before.clientId !== input.clientId) throw AppError.badRequest("A project cannot be moved to a different client");
  await assertAgreement(input.clientId, input.agreementId);
  await prisma.$transaction(async (tx) => {
    await tx.project.update({ where: { id }, data: input });
    await audit(req, { action: "UPDATE", entityType: "Project", entityId: id, clientId: input.clientId, summary: `Project "${input.name}" updated`, changes: diff(before, input) }, tx);
  });
  return getProject(id);
}

export async function deleteProject(req: Request, id: string) {
  const project = await getProject(id);
  await prisma.$transaction(async (tx) => {
    await tx.project.delete({ where: { id } });
    await audit(req, { action: "DELETE", entityType: "Project", entityId: id, clientId: project.clientId, summary: `Project "${project.name}" deleted` }, tx);
  });
}
