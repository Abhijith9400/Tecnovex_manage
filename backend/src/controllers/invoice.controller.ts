import type { Request, Response } from "express";
import * as invoiceService from "../services/invoice.service";
import * as paymentService from "../services/payment.service";
import { loadInvoicePdfData, renderInvoicePdf } from "../services/pdf/invoicePdf";
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
    const { items } = await invoiceService.listInvoices(query, true);
    const csv = toCsv(items, [
      { header: "Invoice No", value: (i) => i.invoiceNumber ?? "DRAFT" },
      { header: "Client", value: (i) => i.client.name },
      { header: "Billing Period", value: (i) => i.billingPeriod },
      { header: "Issue Date", value: (i) => i.issueDate },
      { header: "Due Date", value: (i) => i.dueDate },
      { header: "Status", value: (i) => i.status },
      { header: "Subtotal", value: (i) => i.subtotal.toFixed(2) },
      { header: "Discount", value: (i) => i.discountTotal.toFixed(2) },
      { header: "Tax", value: (i) => i.taxTotal.toFixed(2) },
      { header: "Total", value: (i) => i.total.toFixed(2) },
      { header: "Paid", value: (i) => i.amountPaid.toFixed(2) },
      { header: "Balance", value: (i) => i.balanceDue },
    ]);
    return sendCsv(res, "invoices.csv", csv);
  }
  const { items, total } = await invoiceService.listInvoices(query);
  sendSuccess(res, items, 200, paginationMeta(query.page, query.pageSize, total));
}

export async function get(req: Request, res: Response) {
  sendSuccess(res, await invoiceService.getInvoice(id(req)));
}

export async function create(req: Request, res: Response) {
  sendSuccess(res, await invoiceService.createInvoice(req, req.body), 201);
}

export async function generate(req: Request, res: Response) {
  sendSuccess(res, await invoiceService.generateFromRecurring(req, req.body), 201);
}

export async function generateMonthly(req: Request, res: Response) {
  sendSuccess(res, await invoiceService.generateMonthly(req, req.body.billingPeriod, req.body.issueDate ?? null));
}

export async function update(req: Request, res: Response) {
  sendSuccess(res, await invoiceService.updateDraft(req, id(req), req.body));
}

export async function updateIssued(req: Request, res: Response) {
  sendSuccess(res, await invoiceService.updateIssued(req, id(req), req.body));
}

export async function remove(req: Request, res: Response) {
  await invoiceService.deleteDraft(req, id(req));
  sendSuccess(res, { deleted: true });
}

export async function issue(req: Request, res: Response) {
  sendSuccess(res, await invoiceService.issueInvoice(req, id(req)));
}

export async function cancel(req: Request, res: Response) {
  sendSuccess(res, await invoiceService.cancelInvoice(req, id(req), req.body.reason));
}

export async function revise(req: Request, res: Response) {
  sendSuccess(res, await invoiceService.reviseInvoice(req, id(req), req.body.reason), 201);
}

/** Generates the PDF for this exact invoice from its saved data. ?download=1 forces a file download. */
export async function pdf(req: Request, res: Response) {
  const data = await loadInvoicePdfData(id(req));
  const buffer = await renderInvoicePdf(data);
  sendPdf(res, buffer, `${data.invoice.invoiceNumber ?? "draft-invoice"}.pdf`, req.query.download === "1");
}

export async function payments(req: Request, res: Response) {
  const { items } = await paymentService.listPayments({ invoiceId: id(req), page: 1, pageSize: 100, format: "json" });
  sendSuccess(res, items);
}

/** POST /invoices/:id/payments: records a payment against this invoice. */
export async function recordPayment(req: Request, res: Response) {
  const user = currentUser(req);
  // A manager's payment waits for an administrator.
  if (approvalService.needsApproval(user, "PAYMENT")) {
    return sendRequested(res, await approvalService.requestPayment(req, user, { ...req.body, invoiceId: id(req) }, req.file));
  }
  const result = await paymentService.recordPayment(req, { ...req.body, invoiceId: id(req) }, req.file);
  sendSuccess(res, result, result.duplicateSubmission ? 200 : 201);
}
