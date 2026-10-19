import type { Request, Response } from "express";
import { currentUser } from "../middleware/auth";
import * as adService from "../services/adCampaign.service";
import * as workLogService from "../services/workLog.service";
import { paginationMeta, sendSuccess } from "../utils/apiResponse";
import { sendCsv, toCsv } from "../utils/csv";
import { sendRequested } from "./approval.controller";
import * as approvalService from "../services/approval.service";

const id = (req: Request) => String(req.params.id);

// --- ad campaigns ---

export async function listCampaigns(_req: Request, res: Response) {
  const query = res.locals.query;
  if (query.format === "csv") {
    const { items } = await adService.listCampaigns(query, true);
    return sendCsv(
      res,
      "ad-campaigns.csv",
      toCsv(items, [
        { header: "Client", value: (c) => c.client.name },
        { header: "Campaign", value: (c) => c.name },
        { header: "Platform", value: (c) => c.platform },
        { header: "Type", value: (c) => c.campaignType },
        { header: "Boosted Creative", value: (c) => c.creative?.title },
        { header: "Creative Type", value: (c) => c.creative?.contentType },
        { header: "Post Link", value: (c) => c.postUrl },
        { header: "Status", value: (c) => c.status },
        { header: "Start", value: (c) => c.startDate },
        { header: "End", value: (c) => c.endDate },
        { header: "Budget", value: (c) => c.budget?.toFixed(2) },
        { header: "Spend", value: (c) => c.spend.toFixed(2) },
        { header: "Paid From", value: (c) => c.paidFrom },
        { header: "Impressions", value: (c) => c.impressions },
        { header: "Reach", value: (c) => c.reach },
        { header: "Clicks", value: (c) => c.clicks },
        { header: "Results", value: (c) => c.results },
        { header: "Result Type", value: (c) => c.resultLabel },
        { header: "CTR %", value: (c) => c.metrics.ctr },
        { header: "CPC", value: (c) => c.metrics.cpc },
        { header: "Cost per Result", value: (c) => c.metrics.costPerResult },
      ]),
    );
  }
  const { items, total, totals } = await adService.listCampaigns(query);
  res.status(200).json({ success: true, data: items, meta: { ...paginationMeta(query.page, query.pageSize, total), totals } });
}

export async function creativeOptions(_req: Request, res: Response) {
  sendSuccess(res, await adService.creativeOptions(res.locals.query.clientId));
}

export async function getCampaign(req: Request, res: Response) {
  sendSuccess(res, await adService.getCampaign(id(req)));
}

export async function createCampaign(req: Request, res: Response) {
  sendSuccess(res, await adService.createCampaign(req, req.body), 201);
}

export async function updateCampaign(req: Request, res: Response) {
  sendSuccess(res, await adService.updateCampaign(req, id(req), req.body));
}

export async function deleteCampaign(req: Request, res: Response) {
  const user = currentUser(req);
  // An employee's delete waits for a manager or administrator.
  if (approvalService.needsApproval(user, "DELETE")) return sendRequested(res, await approvalService.requestDelete(req, user, "AdCampaign", id(req)));
  await adService.deleteCampaign(req, id(req));
  sendSuccess(res, { deleted: true });
}

// --- work log ---

export async function listLogs(req: Request, res: Response) {
  const query = res.locals.query;
  const user = currentUser(req);
  if (query.format === "csv") {
    const { items } = await workLogService.listLogs(user, query, true);
    return sendCsv(
      res,
      "work-log.csv",
      toCsv(items, [
        { header: "Date", value: (l) => l.workDate },
        { header: "Employee", value: (l) => l.employee.fullName },
        { header: "Employee ID", value: (l) => l.employee.employeeCode },
        { header: "Client", value: (l) => l.client?.name ?? "Internal" },
        { header: "Task Type", value: (l) => l.taskType },
        { header: "Work", value: (l) => l.title },
        { header: "Hours", value: (l) => l.hours },
        { header: "Details", value: (l) => l.description },
      ]),
    );
  }
  const { items, total, totalHours } = await workLogService.listLogs(user, query);
  res.status(200).json({ success: true, data: items, meta: { ...paginationMeta(query.page, query.pageSize, total), totalHours } });
}

export async function createLog(req: Request, res: Response) {
  sendSuccess(res, await workLogService.createLog(req, currentUser(req), req.body), 201);
}

export async function updateLog(req: Request, res: Response) {
  sendSuccess(res, await workLogService.updateLog(req, currentUser(req), id(req), req.body));
}

export async function deleteLog(req: Request, res: Response) {
  const user = currentUser(req);
  if (approvalService.needsApproval(user, "DELETE")) return sendRequested(res, await approvalService.requestDelete(req, user, "WorkLog", id(req)));
  await workLogService.deleteLog(req, currentUser(req), id(req));
  sendSuccess(res, { deleted: true });
}
