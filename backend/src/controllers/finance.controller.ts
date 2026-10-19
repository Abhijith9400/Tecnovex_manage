import type { Request, Response } from "express";
import * as personalDashboard from "../services/personalDashboard.service";
import * as workDashboardService from "../services/workDashboard.service";
import { access } from "../config/permissions";
import { currentUser } from "../middleware/auth";
import * as financeService from "../services/finance.service";
import { auditFilterOptions } from "../services/reportExtras.service";
import { AppError } from "../utils/AppError";
import * as reportService from "../services/report.service";
import { paginationMeta, sendSuccess } from "../utils/apiResponse";
import { sendCsv, toCsv } from "../utils/csv";
import { sendRequested } from "./approval.controller";
import * as approvalService from "../services/approval.service";

const id = (req: Request) => String(req.params.id);

// --- expenses ---

export async function listExpenses(_req: Request, res: Response) {
  const query = res.locals.query;
  if (query.format === "csv") {
    const { items } = await financeService.listExpenses(query, true);
    const csv = toCsv(items, [
      { header: "Date", value: (e) => e.expenseDate },
      { header: "Title", value: (e) => e.title },
      { header: "Category", value: (e) => e.category.name },
      { header: "Vendor", value: (e) => e.vendor },
      { header: "Amount", value: (e) => e.amount.toFixed(2) },
      { header: "Method", value: (e) => e.paymentMethod },
      { header: "Reference", value: (e) => e.reference },
      { header: "Status", value: (e) => (e.voidedAt ? "VOIDED" : "RECORDED") },
      { header: "Notes", value: (e) => e.notes },
      { header: "Created By", value: (e) => e.createdBy?.name },
    ]);
    return sendCsv(res, "expenses.csv", csv);
  }
  const { items, total, sum } = await financeService.listExpenses(query);
  res.status(200).json({ success: true, data: items, meta: { ...paginationMeta(query.page, query.pageSize, total), sum } });
}

export async function getExpense(req: Request, res: Response) {
  sendSuccess(res, await financeService.getExpense(id(req)));
}

export async function createExpense(req: Request, res: Response) {
  const user = currentUser(req);
  // A manager's expense waits for an administrator.
  if (approvalService.needsApproval(user, "EXPENSE")) return sendRequested(res, await approvalService.requestExpense(req, user, req.body, req.file));
  sendSuccess(res, await financeService.createExpense(req, req.body, req.file), 201);
}

export async function updateExpense(req: Request, res: Response) {
  sendSuccess(res, await financeService.updateExpense(req, id(req), req.body, req.file));
}

export async function voidExpense(req: Request, res: Response) {
  sendSuccess(res, await financeService.voidExpense(req, id(req), req.body.reason));
}

// --- other income ---

export async function listIncome(_req: Request, res: Response) {
  const query = res.locals.query;
  if (query.format === "csv") {
    const { items } = await financeService.listIncome(query, true);
    const csv = toCsv(items, [
      { header: "Date", value: (e) => e.incomeDate },
      { header: "Description", value: (e) => e.description },
      { header: "Category", value: (e) => e.category.name },
      { header: "Source", value: (e) => e.source },
      { header: "Amount", value: (e) => e.amount.toFixed(2) },
      { header: "Method", value: (e) => e.paymentMethod },
      { header: "Reference", value: (e) => e.reference },
      { header: "Status", value: (e) => (e.voidedAt ? "VOIDED" : "RECORDED") },
      { header: "Notes", value: (e) => e.notes },
    ]);
    return sendCsv(res, "other-income.csv", csv);
  }
  const { items, total, sum } = await financeService.listIncome(query);
  res.status(200).json({ success: true, data: items, meta: { ...paginationMeta(query.page, query.pageSize, total), sum } });
}

export async function getIncome(req: Request, res: Response) {
  sendSuccess(res, await financeService.getIncome(id(req)));
}

export async function createIncome(req: Request, res: Response) {
  sendSuccess(res, await financeService.createIncome(req, req.body, req.file), 201);
}

export async function updateIncome(req: Request, res: Response) {
  sendSuccess(res, await financeService.updateIncome(req, id(req), req.body, req.file));
}

export async function voidIncome(req: Request, res: Response) {
  sendSuccess(res, await financeService.voidIncome(req, id(req), req.body.reason));
}

// --- dashboard & reports ---

export async function myDashboard(req: Request, res: Response) {
  sendSuccess(res, await personalDashboard.employeeDashboard(currentUser(req)));
}

export async function workDashboard(req: Request, res: Response) {
  const { from, to } = res.locals.query;
  sendSuccess(res, await workDashboardService.workDashboard(currentUser(req), reportService.resolveRange(from, to)));
}

export async function dashboard(_req: Request, res: Response) {
  const { from, to } = res.locals.query;
  sendSuccess(res, await reportService.dashboard(reportService.resolveRange(from, to)));
}

/** Who may run each category of report. */
const REPORT_ACCESS: Record<reportService.ReportCategory, readonly string[]> = {
  money: access.finance,
  ads: access.staff,
  work: access.workReports,
  audit: access.management,
};

export async function auditOptions(_req: Request, res: Response) {
  sendSuccess(res, await auditFilterOptions());
}

export async function report(req: Request, res: Response) {
  const { from, to, format, clientId, employeeId, entityType, action } = res.locals.query;
  const type = String(req.params.type);
  if (!REPORT_ACCESS[reportService.categoryOf(type)].includes(currentUser(req).role)) throw AppError.forbidden("Your role cannot run this report");
  const range = reportService.resolveRange(from, to);
  const result = await reportService.report(type, range, { clientId, employeeId, entityType, action });
  if (format === "csv") {
    const rows = result.totals ? [...result.rows, result.totals] : result.rows;
    const csv = toCsv(rows, result.columns.map((c) => ({ header: c.label, value: (row: Record<string, unknown>) => row[c.key] })));
    return sendCsv(res, `${req.params.type}-${range.from.toISOString().slice(0, 10)}-to-${range.to.toISOString().slice(0, 10)}.csv`, `${csv}\r\n\r\n"${result.note.replace(/"/g, '""')}"`);
  }
  sendSuccess(res, { ...result, range });
}
