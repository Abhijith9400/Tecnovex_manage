import type { Request, Response } from "express";
import { uploadedFiles } from "../middleware/upload";
import * as agreementService from "../services/agreement.service";
import * as projectService from "../services/project.service";
import { paginationMeta, sendSuccess } from "../utils/apiResponse";

const id = (req: Request) => String(req.params.id);

export async function list(_req: Request, res: Response) {
  const query = res.locals.query;
  const { items, total } = await agreementService.listAgreements(query);
  sendSuccess(res, items, 200, paginationMeta(query.page, query.pageSize, total));
}

export async function get(req: Request, res: Response) {
  sendSuccess(res, await agreementService.getAgreement(id(req)));
}

export async function create(req: Request, res: Response) {
  sendSuccess(res, await agreementService.createAgreement(req, req.body), 201);
}

export async function update(req: Request, res: Response) {
  sendSuccess(res, await agreementService.updateAgreement(req, id(req), req.body));
}

export async function archive(req: Request, res: Response) {
  sendSuccess(res, await agreementService.setArchived(req, id(req), true));
}

export async function restore(req: Request, res: Response) {
  sendSuccess(res, await agreementService.setArchived(req, id(req), false));
}

export async function addDocuments(req: Request, res: Response) {
  sendSuccess(res, await agreementService.addDocuments(req, id(req), uploadedFiles(req), req.body.label ?? null));
}

export async function removeDocument(req: Request, res: Response) {
  sendSuccess(res, await agreementService.removeDocument(req, id(req), String(req.params.fileId)));
}

// --- projects ---

/** Employees see project names for filing creatives, but not budgets. */
function forViewer<T extends { budget: unknown }>(req: Request, project: T) {
  return req.user?.role === "EMPLOYEE" ? { ...project, budget: null } : project;
}

export async function listProjects(req: Request, res: Response) {
  const query = res.locals.query;
  const { items, total } = await projectService.listProjects(query);
  sendSuccess(
    res,
    items.map((p) => forViewer(req, p)),
    200,
    paginationMeta(query.page, query.pageSize, total),
  );
}

export async function getProject(req: Request, res: Response) {
  sendSuccess(res, forViewer(req, await projectService.getProject(id(req))));
}

export async function createProject(req: Request, res: Response) {
  sendSuccess(res, await projectService.createProject(req, req.body), 201);
}

export async function updateProject(req: Request, res: Response) {
  sendSuccess(res, await projectService.updateProject(req, id(req), req.body));
}

export async function deleteProject(req: Request, res: Response) {
  await projectService.deleteProject(req, id(req));
  sendSuccess(res, { deleted: true });
}
