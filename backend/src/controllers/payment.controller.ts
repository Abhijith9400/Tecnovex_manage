import type { Request, Response } from "express";
import * as paymentService from "../services/payment.service";
import { renderReceiptPdf } from "../services/pdf/receiptPdf";
import { AppError } from "../utils/AppError";
import { paginationMeta, sendSuccess } from "../utils/apiResponse";
import { sendCsv, toCsv } from "../utils/csv";
import { sendPdf } from "../utils/pdfResponse";
import { currentUser } from "../middleware/auth";
import { sendRequested } from "./approval.controller";
import * as approvalService from "../services/approval.service";

const id = (req: Request) => String(req.params.id);

export async function list(_req: Request, res: Response) {
  const query = res.locals.query;
  if (query.format === "csv") {
    const { items } = await paymentService.listPayments(query, true);
    const csv = toCsv(items, [
      { header: "Receipt No", value: (p) => p.receiptNumber },
      { header: "Date", value: (p) => p.paymentDate },
      { header: "Client", value: (p) => p.client.name },
      { header: "Invoice", value: (p) => p.invoice?.invoiceNumber ?? "" },
      { header: "Amount", value: (p) => p.amount.toFixed(2) },
      { header: "Method", value: (p) => p.method },
      { header: "Reference", value: (p) => p.reference },
      { header: "Status", value: (p) => p.status },
      { header: "Notes", value: (p) => p.notes },
    ]);
    return sendCsv(res, "payments.csv", csv);
  }
  const { items, total } = await paymentService.listPayments(query);
  sendSuccess(res, items, 200, paginationMeta(query.page, query.pageSize, total));
}

export async function get(req: Request, res: Response) {
  sendSuccess(res, await paymentService.getPayment(id(req)));
}

export async function create(req: Request, res: Response) {
  const user = currentUser(req);
  // A manager's payment waits for an administrator.
  if (approvalService.needsApproval(user, "PAYMENT")) return sendRequested(res, await approvalService.requestPayment(req, user, req.body, req.file));
  const result = await paymentService.recordPayment(req, req.body, req.file);
  sendSuccess(res, result, result.duplicateSubmission ? 200 : 201);
}

export async function voidPayment(req: Request, res: Response) {
  sendSuccess(res, await paymentService.voidPayment(req, id(req), req.body.reason));
}

export async function attachProof(req: Request, res: Response) {
  if (!req.file) throw AppError.badRequest("Choose a file to upload");
  sendSuccess(res, await paymentService.replaceProof(req, id(req), req.file));
}

export async function receipt(req: Request, res: Response) {
  const { buffer, fileName } = await renderReceiptPdf(id(req));
  sendPdf(res, buffer, fileName, req.query.download === "1");
}
