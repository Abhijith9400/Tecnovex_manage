import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/db/prisma";
import { createClientWithService, createUser, login, post, put, resetDatabase, type Session } from "./helpers";

const today = new Date().toISOString().slice(0, 10);

describe("invoices and payments", () => {
  let admin: Session;
  let clientId: string;

  beforeAll(async () => {
    await resetDatabase();
    await createUser("ADMIN", "admin@test.local");
    admin = await login("admin@test.local");
    clientId = await createClientWithService(admin, "10000.00", "18");
  });

  async function issuedInvoice(period: string) {
    const draft = await post(admin, "/api/v1/invoices/generate", { clientId, billingPeriod: period });
    expect(draft.status).toBe(201);
    const issued = await post(admin, `/api/v1/invoices/${draft.body.data.id}/issue`);
    expect(issued.status).toBe(200);
    return issued.body.data;
  }

  it("ignores totals sent by the client and recalculates on the server", async () => {
    const res = await post(admin, "/api/v1/invoices", {
      clientId,
      issueDate: today,
      items: [{ description: "Design", quantity: "2", unitPrice: "1500", discount: "0", taxRate: "18" }],
      total: "1.00",
      subtotal: "1.00",
    });
    expect(res.status).toBe(201);
    expect(res.body.data.subtotal).toBe("3000");
    expect(res.body.data.taxTotal).toBe("540");
    expect(res.body.data.total).toBe("3540");
    expect(res.body.data.invoiceNumber).toBeNull(); // numbers are assigned on issue
  });

  it("generates from recurring services and blocks a duplicate for the same month", async () => {
    const first = await post(admin, "/api/v1/invoices/generate", { clientId, billingPeriod: "2026-01" });
    expect(first.status).toBe(201);
    expect(first.body.data.total).toBe("11800");
    const second = await post(admin, "/api/v1/invoices/generate", { clientId, billingPeriod: "2026-01" });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("DUPLICATE_PERIOD");
  });

  it("assigns unique sequential numbers on issue", async () => {
    const a = await issuedInvoice("2026-02");
    const b = await issuedInvoice("2026-03");
    expect(a.invoiceNumber).toBe("INV-0001");
    expect(b.invoiceNumber).toBe("INV-0002");
  });

  it("does not allow editing an issued invoice's lines", async () => {
    const invoice = await issuedInvoice("2026-04");
    const res = await put(admin, `/api/v1/invoices/${invoice.id}`, {
      clientId,
      issueDate: today,
      items: [{ description: "Changed", quantity: "1", unitPrice: "1" }],
    });
    expect(res.status).toBe(400);
  });

  it("records partial and full payments and updates status consistently", async () => {
    const invoice = await issuedInvoice("2026-05");
    const partial = await post(admin, `/api/v1/invoices/${invoice.id}/payments`, { paymentDate: today, amount: "5000", method: "UPI", reference: "TXN-1" });
    expect(partial.status).toBe(201);
    let fresh = (await admin.agent.get(`/api/v1/invoices/${invoice.id}`)).body.data;
    expect(fresh.amountPaid).toBe("5000");
    expect(fresh.balanceDue).toBe("6800.00");
    expect(fresh.status).toBe("PARTIALLY_PAID");

    const rest = await post(admin, `/api/v1/invoices/${invoice.id}/payments`, { paymentDate: today, amount: "6800", method: "BANK_TRANSFER", reference: "NEFT-9" });
    expect(rest.status).toBe(201);
    fresh = (await admin.agent.get(`/api/v1/invoices/${invoice.id}`)).body.data;
    expect(fresh.status).toBe("PAID");
    expect(fresh.balanceDue).toBe("0.00");
  });

  it("rejects overpayment", async () => {
    const invoice = await issuedInvoice("2026-06");
    const res = await post(admin, `/api/v1/invoices/${invoice.id}/payments`, { paymentDate: today, amount: "11800.01", method: "CASH" });
    expect(res.status).toBe(400);
  });

  it("treats a repeated submission with the same idempotency key as one payment", async () => {
    const invoice = await issuedInvoice("2026-07");
    const body = { paymentDate: today, amount: "1000", method: "CASH", idempotencyKey: "form-submit-0001" };
    const [a, b] = await Promise.all([post(admin, `/api/v1/invoices/${invoice.id}/payments`, body), post(admin, `/api/v1/invoices/${invoice.id}/payments`, body)]);
    expect([a.status, b.status].sort()).toEqual([200, 201]);
    expect(await prisma.payment.count({ where: { invoiceId: invoice.id } })).toBe(1);
    const fresh = (await admin.agent.get(`/api/v1/invoices/${invoice.id}`)).body.data;
    expect(fresh.amountPaid).toBe("1000");
  });

  it("rejects concurrent payments that together would overpay", async () => {
    const invoice = await issuedInvoice("2026-08");
    const pay = (ref: string) => post(admin, `/api/v1/invoices/${invoice.id}/payments`, { paymentDate: today, amount: "8000", method: "BANK_TRANSFER", reference: ref });
    const results = await Promise.all([pay("C-1"), pay("C-2")]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
    const fresh = (await admin.agent.get(`/api/v1/invoices/${invoice.id}`)).body.data;
    expect(fresh.amountPaid).toBe("8000");
  });

  it("blocks the same transaction reference being recorded twice", async () => {
    const invoice = await issuedInvoice("2026-09");
    await post(admin, `/api/v1/invoices/${invoice.id}/payments`, { paymentDate: today, amount: "100", method: "UPI", reference: "upi 777" });
    const dup = await post(admin, `/api/v1/invoices/${invoice.id}/payments`, { paymentDate: today, amount: "100", method: "UPI", reference: "UPI777" });
    expect(dup.status).toBe(409);
  });

  it("voiding a payment restores the invoice balance", async () => {
    const invoice = await issuedInvoice("2026-10");
    const payment = await post(admin, `/api/v1/invoices/${invoice.id}/payments`, { paymentDate: today, amount: "11800", method: "CASH" });
    expect((await admin.agent.get(`/api/v1/invoices/${invoice.id}`)).body.data.status).toBe("PAID");
    const voided = await post(admin, `/api/v1/payments/${payment.body.data.payment.id}/void`, { reason: "Entered in error" });
    expect(voided.status).toBe(200);
    const fresh = (await admin.agent.get(`/api/v1/invoices/${invoice.id}`)).body.data;
    expect(fresh.amountPaid).toBe("0");
    expect(["ISSUED", "OVERDUE"]).toContain(fresh.status);
  });

  it("revising an issued invoice cancels it and creates a linked draft", async () => {
    const invoice = await issuedInvoice("2026-11");
    const res = await post(admin, `/api/v1/invoices/${invoice.id}/revise`, { reason: "Wrong rate" });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe("DRAFT");
    expect(res.body.data.revisedFromId).toBe(invoice.id);
    const original = (await admin.agent.get(`/api/v1/invoices/${invoice.id}`)).body.data;
    expect(original.status).toBe("CANCELLED");
    expect(original.invoiceNumber).toBe(invoice.invoiceNumber); // number retained for the audit trail
  });

  it("generates the PDF for the exact invoice", async () => {
    const invoice = await issuedInvoice("2026-12");
    const res = await admin.agent.get(`/api/v1/invoices/${invoice.id}/pdf`).buffer(true);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/pdf");
    expect(res.headers["content-disposition"]).toContain(invoice.invoiceNumber);
  });

  it("writes an audit trail for financial actions", async () => {
    const actions = await prisma.auditLog.findMany({ where: { entityType: { in: ["Invoice", "Payment"] } }, select: { action: true } });
    const set = new Set(actions.map((a) => a.action));
    for (const action of ["CREATE", "ISSUE", "VOID", "REVISE"]) expect(set.has(action)).toBe(true);
  });
});
