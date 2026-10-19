import type { Request, Response } from "express";
import { currentUser } from "../middleware/auth";
import * as taskService from "../services/task.service";
import { paginationMeta, sendSuccess } from "../utils/apiResponse";
import { sendRequested } from "./approval.controller";
import * as approvalService from "../services/approval.service";

const id = (req: Request) => String(req.params.id);

export async function list(req: Request, res: Response) {
  const query = res.locals.query;
  const { items, total, summary } = await taskService.listTasks(currentUser(req), query);
  res.status(200).json({ success: true, data: items, meta: { ...paginationMeta(query.page, query.pageSize, total), summary } });
}

export async function options(req: Request, res: Response) {
  const employeeId = typeof req.query.employeeId === "string" ? req.query.employeeId : undefined;
  sendSuccess(res, await taskService.taskOptions(currentUser(req), employeeId));
}

export async function get(req: Request, res: Response) {
  sendSuccess(res, await taskService.getTask(currentUser(req), id(req)));
}

export async function create(req: Request, res: Response) {
  sendSuccess(res, await taskService.createTask(req, currentUser(req), req.body), 201);
}

export async function update(req: Request, res: Response) {
  sendSuccess(res, await taskService.updateTask(req, currentUser(req), id(req), req.body));
}

export async function setStatus(req: Request, res: Response) {
  sendSuccess(res, await taskService.setStatus(req, currentUser(req), id(req), req.body.status));
}

export async function comment(req: Request, res: Response) {
  sendSuccess(res, await taskService.addComment(req, currentUser(req), id(req), req.body.body), 201);
}

export async function remove(req: Request, res: Response) {
  const user = currentUser(req);
  // An employee's delete waits for a manager or administrator.
  if (approvalService.needsApproval(user, "DELETE")) return sendRequested(res, await approvalService.requestDelete(req, user, "Task", id(req)));
  await taskService.deleteTask(req, currentUser(req), id(req));
  sendSuccess(res, { deleted: true });
}
