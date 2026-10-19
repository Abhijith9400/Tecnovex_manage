import type { Request, Response } from "express";
import { currentUser } from "../middleware/auth";
import * as approvalService from "../services/approval.service";
import { paginationMeta, sendSuccess } from "../utils/apiResponse";

const id = (req: Request) => String(req.params.id);

export async function list(req: Request, res: Response) {
  const query = res.locals.query;
  const { items, total } = await approvalService.listRequests(currentUser(req), query);
  sendSuccess(res, items, 200, paginationMeta(query.page, query.pageSize, total));
}

export async function counts(req: Request, res: Response) {
  sendSuccess(res, await approvalService.pendingCount(currentUser(req)));
}

export async function get(req: Request, res: Response) {
  sendSuccess(res, await approvalService.getRequest(currentUser(req), id(req)));
}

export async function approve(req: Request, res: Response) {
  sendSuccess(res, await approvalService.approve(req, currentUser(req), id(req), req.body.note ?? undefined));
}

export async function reject(req: Request, res: Response) {
  sendSuccess(res, await approvalService.reject(req, currentUser(req), id(req), req.body.note ?? undefined));
}

export async function cancel(req: Request, res: Response) {
  sendSuccess(res, await approvalService.cancel(req, currentUser(req), id(req)));
}

/** 202 response for an action that became an approval request instead of happening now. */
export function sendRequested(res: Response, request: Awaited<ReturnType<typeof approvalService.getRequest>> | { id: string; title: string }) {
  sendSuccess(res, { approvalRequested: true, request }, 202);
}
