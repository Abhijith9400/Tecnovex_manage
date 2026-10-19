import type { Request, Response } from "express";
import { currentUser } from "../middleware/auth";
import * as calendarService from "../services/calendar.service";
import { sendSuccess } from "../utils/apiResponse";
import { sendRequested } from "./approval.controller";
import * as approvalService from "../services/approval.service";

const id = (req: Request) => String(req.params.id);

export async function range(req: Request, res: Response) {
  sendSuccess(res, await calendarService.listRange(currentUser(req), res.locals.query));
}

export async function get(req: Request, res: Response) {
  sendSuccess(res, await calendarService.getEvent(currentUser(req), id(req)));
}

export async function create(req: Request, res: Response) {
  sendSuccess(res, await calendarService.createEvent(req, currentUser(req), req.body), 201);
}

export async function update(req: Request, res: Response) {
  sendSuccess(res, await calendarService.updateEvent(req, currentUser(req), id(req), req.body));
}

export async function move(req: Request, res: Response) {
  sendSuccess(res, await calendarService.moveEvent(req, currentUser(req), id(req), req.body));
}

export async function remove(req: Request, res: Response) {
  const user = currentUser(req);
  // An employee's delete waits for a manager or administrator.
  if (approvalService.needsApproval(user, "DELETE")) {
    return sendRequested(res, await approvalService.requestDelete(req, user, "CalendarEvent", id(req), { occurrence: res.locals.query.occurrence }));
  }
  await calendarService.deleteEvent(req, currentUser(req), id(req), res.locals.query.occurrence);
  sendSuccess(res, { deleted: true });
}
