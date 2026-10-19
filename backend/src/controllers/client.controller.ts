import type { Request, Response } from "express";
import * as clientService from "../services/client.service";
import { paginationMeta, sendSuccess } from "../utils/apiResponse";
import { currentUser } from "../middleware/auth";
import { sendRequested } from "./approval.controller";
import * as approvalService from "../services/approval.service";

/** Employees work with clients but don't see what they pay. */
const PRICE_FIELDS = ["monthlyRetainer", "projectPrice"] as const;
const isEmployee = (req: Request) => req.user?.role === "EMPLOYEE";

function forViewer<T extends object>(req: Request, client: T): T {
  if (!isEmployee(req)) return client;
  const copy = { ...client } as Record<string, unknown>;
  for (const field of PRICE_FIELDS) if (field in copy) copy[field] = null;
  if ("services" in copy) copy.services = [];
  return copy as unknown as T;
}

/** An employee's edit never touches pricing (they never saw it, so the form sends it blank). */
function withoutPricing(req: Request, body: Record<string, unknown>) {
  if (!isEmployee(req)) return body;
  const copy = { ...body };
  for (const field of PRICE_FIELDS) delete copy[field];
  return copy;
}

export async function list(req: Request, res: Response) {
  const query = res.locals.query;
  const { items, total } = await clientService.listClients(query);
  sendSuccess(
    res,
    items.map((c) => forViewer(req, c)),
    200,
    paginationMeta(query.page, query.pageSize, total),
  );
}

export async function options(req: Request, res: Response) {
  sendSuccess(res, await clientService.clientOptions(req.query.includeArchived === "true"));
}

export async function get(req: Request, res: Response) {
  sendSuccess(res, forViewer(req, await clientService.getClient(String(req.params.id))));
}

export async function create(req: Request, res: Response) {
  sendSuccess(res, forViewer(req, await clientService.createClient(req, req.body)), 201);
}

export async function update(req: Request, res: Response) {
  const updated = await clientService.updateClient(req, String(req.params.id), withoutPricing(req, req.body) as typeof req.body);
  sendSuccess(res, forViewer(req, updated));
}

export async function archive(req: Request, res: Response) {
  const user = currentUser(req);
  // An employee archiving a client waits for a manager or administrator.
  if (approvalService.needsApproval(user, "DELETE")) return sendRequested(res, await approvalService.requestDelete(req, user, "Client", String(req.params.id)));
  sendSuccess(res, await clientService.setArchived(req, String(req.params.id), true));
}

export async function restore(req: Request, res: Response) {
  sendSuccess(res, await clientService.setArchived(req, String(req.params.id), false));
}

export async function summary(req: Request, res: Response) {
  sendSuccess(res, await clientService.clientSummary(String(req.params.id)));
}

export async function activity(req: Request, res: Response) {
  const { page, pageSize } = res.locals.query;
  const { items, total } = await clientService.clientActivity(String(req.params.id), page, pageSize);
  sendSuccess(res, items, 200, paginationMeta(page, pageSize, total));
}

export async function addService(req: Request, res: Response) {
  sendSuccess(res, await clientService.addService(req, String(req.params.id), req.body), 201);
}

export async function updateService(req: Request, res: Response) {
  sendSuccess(res, await clientService.updateService(req, String(req.params.id), String(req.params.serviceId), req.body));
}

export async function removeService(req: Request, res: Response) {
  sendSuccess(res, await clientService.removeService(req, String(req.params.id), String(req.params.serviceId)));
}
