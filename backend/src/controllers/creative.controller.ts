import type { Request, Response } from "express";
import { uploadedFiles } from "../middleware/upload";
import * as creativeService from "../services/creative.service";
import { paginationMeta, sendSuccess } from "../utils/apiResponse";
import { currentUser } from "../middleware/auth";
import { sendRequested } from "./approval.controller";
import * as approvalService from "../services/approval.service";

const clientId = (req: Request) => String(req.params.clientId);
const creativeId = (req: Request) => String(req.params.creativeId);

/** Lists creatives; when mounted under /clients/:clientId the client filter is forced. */
export async function list(req: Request, res: Response) {
  const query = { ...res.locals.query, ...(req.params.clientId ? { clientId: clientId(req) } : {}) };
  const { items, total } = await creativeService.listCreatives(query);
  sendSuccess(res, items, 200, paginationMeta(query.page, query.pageSize, total));
}

export async function campaigns(req: Request, res: Response) {
  const id = req.params.clientId ? clientId(req) : typeof req.query.clientId === "string" ? req.query.clientId : undefined;
  sendSuccess(res, await creativeService.campaigns(id));
}

export async function get(req: Request, res: Response) {
  sendSuccess(res, await creativeService.getCreative(clientId(req), creativeId(req)));
}

export async function create(req: Request, res: Response) {
  sendSuccess(res, await creativeService.createCreative(req, clientId(req), req.body, uploadedFiles(req)), 201);
}

export async function update(req: Request, res: Response) {
  sendSuccess(res, await creativeService.updateCreative(req, clientId(req), creativeId(req), req.body));
}

export async function addFiles(req: Request, res: Response) {
  sendSuccess(res, await creativeService.addFiles(req, clientId(req), creativeId(req), uploadedFiles(req)));
}

export async function removeFile(req: Request, res: Response) {
  const user = currentUser(req);
  if (approvalService.needsApproval(user, "DELETE")) {
    return sendRequested(res, await approvalService.requestDelete(req, user, "CreativeFile", String(req.params.fileId), { clientId: clientId(req), creativeId: creativeId(req) }));
  }
  sendSuccess(res, await creativeService.removeFile(req, clientId(req), creativeId(req), String(req.params.fileId)));
}

export async function remove(req: Request, res: Response) {
  const user = currentUser(req);
  // An employee's delete waits for a manager or administrator.
  if (approvalService.needsApproval(user, "DELETE")) return sendRequested(res, await approvalService.requestDelete(req, user, "CreativeAsset", creativeId(req), { clientId: clientId(req) }));
  await creativeService.deleteCreative(req, clientId(req), creativeId(req));
  sendSuccess(res, { deleted: true });
}
