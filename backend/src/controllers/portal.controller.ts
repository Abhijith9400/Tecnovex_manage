import type { Request, Response } from "express";
import { clientDashboard } from "../services/personalDashboard.service";
import * as portalService from "../services/portal.service";
import { paginationMeta, sendSuccess } from "../utils/apiResponse";

export async function dashboard(req: Request, res: Response) {
  sendSuccess(res, await clientDashboard(portalService.portalClientId(req)));
}

export async function me(req: Request, res: Response) {
  sendSuccess(res, await portalService.profile(portalService.portalClientId(req)));
}

export async function list(req: Request, res: Response) {
  const query = res.locals.query;
  const { items, total } = await portalService.listCreatives(portalService.portalClientId(req), query);
  sendSuccess(res, items, 200, paginationMeta(query.page, query.pageSize, total));
}

export async function campaigns(req: Request, res: Response) {
  sendSuccess(res, await portalService.campaigns(portalService.portalClientId(req)));
}

export async function get(req: Request, res: Response) {
  sendSuccess(res, await portalService.getCreative(portalService.portalClientId(req), String(req.params.id)));
}

export async function download(req: Request, res: Response) {
  await portalService.downloadZip(req, res, portalService.portalClientId(req), String(req.params.id));
}
