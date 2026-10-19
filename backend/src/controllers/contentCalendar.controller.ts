import type { Request, Response } from "express";
import { currentUser } from "../middleware/auth";
import * as approvalService from "../services/approval.service";
import * as calendarService from "../services/contentCalendar.service";
import { portalClientId } from "../services/portal.service";
import { AppError } from "../utils/AppError";
import { sendSuccess } from "../utils/apiResponse";
import { sendRequested } from "./approval.controller";

const id = (req: Request) => String(req.params.id);

export async function list(_req: Request, res: Response) {
  sendSuccess(res, await calendarService.listCalendars(res.locals.query));
}

export async function preview(_req: Request, res: Response) {
  const { clientId, period } = res.locals.query;
  if (!clientId || !period) throw AppError.badRequest("Choose a client and month");
  sendSuccess(res, await calendarService.preview(clientId, period));
}

export async function create(req: Request, res: Response) {
  sendSuccess(res, await calendarService.createCalendar(req, req.body, req.file), 201);
}

export async function update(req: Request, res: Response) {
  sendSuccess(res, await calendarService.updateCalendar(req, id(req), req.body));
}

export async function remove(req: Request, res: Response) {
  const user = currentUser(req);
  // An employee's delete waits for a manager or administrator.
  if (approvalService.needsApproval(user, "DELETE")) return sendRequested(res, await approvalService.requestDelete(req, user, "ContentCalendar", id(req)));
  await calendarService.deleteCalendar(req, id(req));
  sendSuccess(res, { deleted: true });
}

export async function file(req: Request, res: Response) {
  await calendarService.sendCalendar(res, id(req), res.locals.query.download);
}

// --- client portal ---

export async function portalList(req: Request, res: Response) {
  sendSuccess(res, await calendarService.portalList(portalClientId(req)));
}

export async function portalFile(req: Request, res: Response) {
  await calendarService.portalSend(res, portalClientId(req), id(req), res.locals.query.download);
}
