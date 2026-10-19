import type { Request, Response } from "express";
import { currentUser } from "../middleware/auth";
import * as employeeService from "../services/employee.service";
import * as payrollService from "../services/payroll.service";
import { renderPayslipPdf } from "../services/pdf/payslipPdf";
import { AppError } from "../utils/AppError";
import { paginationMeta, sendSuccess } from "../utils/apiResponse";
import { sendPdf } from "../utils/pdfResponse";
import { sendRequested } from "./approval.controller";
import * as approvalService from "../services/approval.service";

const id = (req: Request) => String(req.params.id);

// --- employees ---

export async function list(_req: Request, res: Response) {
  const query = res.locals.query;
  const { items, total } = await employeeService.listEmployees(query);
  sendSuccess(res, items, 200, paginationMeta(query.page, query.pageSize, total));
}

export async function options(_req: Request, res: Response) {
  sendSuccess(res, await employeeService.employeeOptions());
}

export async function get(req: Request, res: Response) {
  sendSuccess(res, await employeeService.getEmployee(id(req)));
}

export async function create(req: Request, res: Response) {
  sendSuccess(res, await employeeService.createEmployee(req, req.body), 201);
}

export async function update(req: Request, res: Response) {
  sendSuccess(res, await employeeService.updateEmployee(req, id(req), req.body));
}

export async function addStructure(req: Request, res: Response) {
  sendSuccess(res, await employeeService.addSalaryStructure(req, id(req), req.body), 201);
}

export async function deleteStructure(req: Request, res: Response) {
  sendSuccess(res, await employeeService.deleteSalaryStructure(req, id(req), String(req.params.structureId)));
}

// --- payroll ---

export async function listPayroll(_req: Request, res: Response) {
  const query = res.locals.query;
  const { items, total } = await payrollService.listPayroll(query);
  sendSuccess(res, items, 200, paginationMeta(query.page, query.pageSize, total));
}

/** Employee self-service: own paid payslips only. */
export async function myPayroll(req: Request, res: Response) {
  const user = currentUser(req);
  if (!user.employeeId) throw AppError.forbidden("Your account is not linked to an employee record");
  const query = res.locals.query;
  const { items, total } = await payrollService.listPayroll(query, user.employeeId);
  sendSuccess(res, items, 200, paginationMeta(query.page, query.pageSize, total));
}

export async function getPayroll(req: Request, res: Response) {
  sendSuccess(res, await payrollService.getPayroll(id(req), currentUser(req)));
}

export async function createPayroll(req: Request, res: Response) {
  const { employeeId, period, ...inputs } = req.body;
  sendSuccess(res, await payrollService.createPayroll(req, employeeId, period, inputs), 201);
}

export async function generatePayroll(req: Request, res: Response) {
  sendSuccess(res, await payrollService.generatePayroll(req, req.body.period));
}

export async function updatePayroll(req: Request, res: Response) {
  sendSuccess(res, await payrollService.updatePayroll(req, id(req), req.body));
}

export async function approve(req: Request, res: Response) {
  sendSuccess(res, await payrollService.approvePayroll(req, id(req)));
}

export async function reopen(req: Request, res: Response) {
  sendSuccess(res, await payrollService.reopenPayroll(req, id(req)));
}

export async function pay(req: Request, res: Response) {
  const user = currentUser(req);
  // A manager's payroll payout waits for an administrator.
  if (approvalService.needsApproval(user, "PAYROLL_PAYMENT")) return sendRequested(res, await approvalService.requestPayrollPayment(req, user, id(req), req.body));
  sendSuccess(res, await payrollService.markPaid(req, id(req), req.body));
}

export async function removePayroll(req: Request, res: Response) {
  await payrollService.deletePayroll(req, id(req));
  sendSuccess(res, { deleted: true });
}

export async function addAdjustment(req: Request, res: Response) {
  sendSuccess(res, await payrollService.addAdjustment(req, id(req), req.body), 201);
}

/** Access check (admin, or the employee's own paid record) happens in getPayroll before rendering. */
export async function payslip(req: Request, res: Response) {
  await payrollService.getPayroll(id(req), currentUser(req));
  const { buffer, fileName } = await renderPayslipPdf(id(req));
  sendPdf(res, buffer, fileName, req.query.download === "1");
}

export async function listStatutory(_req: Request, res: Response) {
  sendSuccess(res, await payrollService.listStatutory());
}

export async function createStatutory(req: Request, res: Response) {
  sendSuccess(res, await payrollService.saveStatutory(req, null, req.body), 201);
}

export async function updateStatutory(req: Request, res: Response) {
  sendSuccess(res, await payrollService.saveStatutory(req, id(req), req.body));
}
