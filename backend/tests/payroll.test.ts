import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/db/prisma";
import { createUser, login, post, put, resetDatabase, type Session } from "./helpers";

describe("payroll", () => {
  let admin: Session;
  let employeeId: string;

  beforeAll(async () => {
    await resetDatabase();
    await createUser("ADMIN", "admin@test.local");
    admin = await login("admin@test.local");
    const employee = await post(admin, "/api/v1/employees", { fullName: "Test Employee", joiningDate: "2025-01-01", status: "ACTIVE", bankAccountNumber: "123456789012" });
    expect(employee.status).toBe(201);
    employeeId = employee.body.data.id;
    await post(admin, `/api/v1/employees/${employeeId}/salary-structures`, { effectiveFrom: "2025-01-01", basic: "20000", allowances: "5000", applyStatutory: true });
    await post(admin, `/api/v1/employees/${employeeId}/salary-structures`, { effectiveFrom: "2026-04-01", basic: "25000", allowances: "5000", applyStatutory: true });
    await post(admin, "/api/v1/payroll/statutory-deductions", { name: "Example 10% of basic", basis: "PERCENT_OF_BASIC", value: "10", maxAmount: "2000" });
  });

  it("uses the salary structure in force for the payroll month", async () => {
    const march = await post(admin, "/api/v1/payroll", { employeeId, period: "2026-03" });
    expect(march.status).toBe(201);
    expect(march.body.data.grossEarnings).toBe("25000");
    expect(march.body.data.netPay).toBe("23000"); // 10% of 20000 basic

    const april = await post(admin, "/api/v1/payroll", { employeeId, period: "2026-04" });
    expect(april.body.data.grossEarnings).toBe("30000");
    expect(april.body.data.netPay).toBe("28000"); // 2500 capped at 2000
  });

  it("prevents duplicate payroll for the same employee and month", async () => {
    const dup = await post(admin, "/api/v1/payroll", { employeeId, period: "2026-03" });
    expect(dup.status).toBe(409);
  });

  it("follows Pending → Approved → Paid and locks paid records", async () => {
    const record = await post(admin, "/api/v1/payroll", { employeeId, period: "2026-05", incentives: "1000" });
    const id = record.body.data.id;
    expect(record.body.data.status).toBe("PENDING");

    expect((await post(admin, `/api/v1/payroll/${id}/pay`, { paidAt: "2026-06-01", paymentMethod: "BANK_TRANSFER" })).status).toBe(400); // must approve first
    expect((await post(admin, `/api/v1/payroll/${id}/approve`)).body.data.status).toBe("APPROVED");
    const paid = await post(admin, `/api/v1/payroll/${id}/pay`, { paidAt: "2026-06-01", paymentMethod: "BANK_TRANSFER", paymentReference: "NEFT1" });
    expect(paid.body.data.status).toBe("PAID");

    const edit = await put(admin, `/api/v1/payroll/${id}`, { incentives: "0" });
    expect(edit.status).toBe(400);
    expect((await admin.agent.delete(`/api/v1/payroll/${id}`).set("X-CSRF-Token", admin.csrf)).status).toBe(400);
  });

  it("corrects paid payroll only through auditable adjustments", async () => {
    const record = await prisma.payrollRecord.findFirstOrThrow({ where: { status: "PAID" } });
    const res = await post(admin, `/api/v1/payroll/${record.id}/adjustments`, { amount: "-500", reason: "Excess incentive recovered" });
    expect(res.status).toBe(201);
    expect(res.body.data.adjustmentsTotal).toBe("-500.00");
    expect(res.body.data.netPay).toBe(record.netPay.toString()); // original untouched
    expect(await prisma.auditLog.count({ where: { entityId: record.id, action: "ADJUST" } })).toBe(1);
  });

  it("restricts payslips: employees see only their own paid payslips", async () => {
    const paid = await prisma.payrollRecord.findFirstOrThrow({ where: { status: "PAID" } });
    const pending = await prisma.payrollRecord.findFirstOrThrow({ where: { status: "PENDING" } });
    const other = await prisma.employee.create({ data: { employeeCode: "EMP-OTHER", fullName: "Other", joiningDate: new Date("2025-01-01") } });

    await createUser("EMPLOYEE", "self@test.local", employeeId);
    await createUser("EMPLOYEE", "other@test.local", other.id);
    const self = await login("self@test.local");
    const stranger = await login("other@test.local");

    expect((await self.agent.get(`/api/v1/payroll/${paid.id}/payslip`)).status).toBe(200);
    expect((await self.agent.get(`/api/v1/payroll/${pending.id}`)).status).toBe(404);
    expect((await stranger.agent.get(`/api/v1/payroll/${paid.id}/payslip`)).status).toBe(404);
    expect((await self.agent.get("/api/v1/payroll")).status).toBe(403);
    const mine = await self.agent.get("/api/v1/payroll/my");
    expect(mine.body.data.every((r: { employeeId: string; status: string }) => r.employeeId === employeeId && r.status === "PAID")).toBe(true);
  });

  it("masks bank account numbers in employee lists", async () => {
    const list = await admin.agent.get("/api/v1/employees");
    const employee = list.body.data.find((e: { id: string }) => e.id === employeeId);
    expect(employee.bankAccountNumber).toMatch(/^•+9012$/);
  });
});
