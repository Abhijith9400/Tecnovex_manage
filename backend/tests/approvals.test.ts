import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/db/prisma";
import { createClientWithService, createUser, login, post, put, resetDatabase, type Session } from "./helpers";

const today = new Date().toISOString().slice(0, 10);

describe("manager money approvals", () => {
  let admin: Session;
  let manager: Session;
  let clientId: string;
  let invoice: { id: string; total: string; invoiceNumber: string };
  let categoryId: string;

  beforeAll(async () => {
    await resetDatabase();
    await createUser("ADMIN", "admin@test.local");
    await createUser("MANAGER", "manager@test.local");
    admin = await login("admin@test.local");
    manager = await login("manager@test.local");
    clientId = await createClientWithService(admin, "10000.00", "0");
    const draft = await post(admin, "/api/v1/invoices/generate", { clientId, billingPeriod: "2026-09" });
    invoice = (await post(admin, `/api/v1/invoices/${draft.body.data.id}/issue`)).body.data;
    categoryId = (await prisma.category.create({ data: { type: "EXPENSE", name: "Software" } })).id;
  });

  it("holds a manager's payment until an administrator approves it", async () => {
    const asked = await post(manager, "/api/v1/payments", { invoiceId: invoice.id, paymentDate: today, amount: "4000", method: "UPI", reference: "UPI-123" });
    expect(asked.status).toBe(202);
    expect(asked.body.data.request).toMatchObject({ kind: "PAYMENT", status: "PENDING", amount: "4000" });
    expect(asked.body.data.request.title).toContain(invoice.invoiceNumber);

    // Nothing is recorded yet.
    expect(await prisma.payment.count()).toBe(0);
    expect((await admin.agent.get(`/api/v1/invoices/${invoice.id}`)).body.data.amountPaid).toBe("0");

    // Managers can't approve money; admins can.
    const id = asked.body.data.request.id;
    expect((await post(manager, `/api/v1/approvals/${id}/approve`, {})).status).toBe(403);
    const counts = (await admin.agent.get("/api/v1/approvals/counts")).body.data;
    expect(counts.toReview).toBe(1);
    const approved = await post(admin, `/api/v1/approvals/${id}/approve`, {});
    expect(approved.status).toBe(200);
    expect(approved.body.data.status).toBe("APPROVED");

    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: approved.body.data.resultId } });
    expect(payment.amount.toFixed(2)).toBe("4000.00");
    expect(payment.receiptNumber).toMatch(/^RCPT-/);
    const after = (await admin.agent.get(`/api/v1/invoices/${invoice.id}`)).body.data;
    expect(after).toMatchObject({ amountPaid: "4000", status: "PARTIALLY_PAID" });
    // Approving twice does nothing.
    expect((await post(admin, `/api/v1/approvals/${id}/approve`, {})).status).toBe(400);
  });

  it("also holds payments recorded from the invoice page", async () => {
    const asked = await post(manager, `/api/v1/invoices/${invoice.id}/payments`, { paymentDate: today, amount: "1000", method: "CASH" });
    expect(asked.status).toBe(202);
    expect((await admin.agent.get(`/api/v1/invoices/${invoice.id}`)).body.data.amountPaid).toBe("4000");
    await post(admin, `/api/v1/approvals/${asked.body.data.request.id}/reject`, {});
  });

  it("keeps a rejected expense out of the books", async () => {
    const asked = await post(manager, "/api/v1/expenses", { title: "Canva Pro", categoryId, amount: "999", expenseDate: today, paymentMethod: "CARD" });
    expect(asked.status).toBe(202);
    const rejected = await post(admin, `/api/v1/approvals/${asked.body.data.request.id}/reject`, { note: "Use the team plan" });
    expect(rejected.body.data).toMatchObject({ status: "REJECTED", reviewNote: "Use the team plan" });
    expect(await prisma.expense.count()).toBe(0);
  });

  it("records an approved expense with the admin as approver", async () => {
    const asked = await post(manager, "/api/v1/expenses", { title: "Figma", categoryId, amount: "1500", expenseDate: today, paymentMethod: "CARD" });
    const approved = await post(admin, `/api/v1/approvals/${asked.body.data.request.id}/approve`, {});
    expect(approved.status).toBe(200);
    const expense = await prisma.expense.findUniqueOrThrow({ where: { id: approved.body.data.resultId } });
    expect(expense.amount.toFixed(2)).toBe("1500.00");
  });

  it("does not let managers edit or void payments and expenses", async () => {
    const payment = await prisma.payment.findFirstOrThrow();
    const expense = await prisma.expense.findFirstOrThrow();
    expect((await post(manager, `/api/v1/payments/${payment.id}/void`, { reason: "x" })).status).toBe(403);
    expect((await post(manager, `/api/v1/expenses/${expense.id}/void`, { reason: "x" })).status).toBe(403);
    expect((await put(manager, `/api/v1/expenses/${expense.id}`, { title: "x", categoryId, amount: "1", expenseDate: today, paymentMethod: "CARD" })).status).toBe(403);
  });

  it("lets the requester withdraw a pending request", async () => {
    const asked = await post(manager, "/api/v1/expenses", { title: "Stock photos", categoryId, amount: "300", expenseDate: today, paymentMethod: "UPI" });
    const id = asked.body.data.request.id;
    expect((await post(admin, `/api/v1/approvals/${id}/cancel`, {})).status).toBe(404);
    expect((await post(manager, `/api/v1/approvals/${id}/cancel`, {})).body.data.status).toBe("CANCELLED");
    const mine = (await manager.agent.get("/api/v1/approvals").query({ mine: "true" })).body.data;
    expect(mine.map((r: { status: string }) => r.status).sort()).toEqual(["APPROVED", "APPROVED", "CANCELLED", "REJECTED", "REJECTED"]);
  });

  it("lets managers manage logins but never create or change administrators", async () => {
    const base = { name: "New person", password: "a-long-password-123", employeeId: null, clientId: null };
    expect((await post(manager, "/api/v1/auth/users", { ...base, email: "new-admin@test.local", role: "ADMIN" })).status).toBe(403);
    expect((await post(manager, "/api/v1/auth/users", { ...base, email: "new-accountant@test.local", role: "ACCOUNTANT" })).status).toBe(201);
    const adminUser = await prisma.user.findUniqueOrThrow({ where: { email: "admin@test.local" } });
    expect((await manager.agent.patch(`/api/v1/auth/users/${adminUser.id}`).set("X-CSRF-Token", manager.csrf).send({ isActive: false })).status).toBe(403);
  });

  it("does not let managers turn off the sign-in code", async () => {
    expect((await put(manager, "/api/v1/settings/security", { loginOtpEnabled: false })).status).toBe(403);
  });
});
