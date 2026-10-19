import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/db/prisma";
import { app, createUser, login, PASSWORD, post, put, resetDatabase } from "./helpers";

describe("authentication, CSRF and authorization", () => {
  beforeAll(async () => {
    await resetDatabase();
    await createUser("ADMIN", "admin@test.local");
    await createUser("ACCOUNTANT", "accountant@test.local");
    await createUser("MANAGER", "manager@test.local");
  });

  it("rejects unauthenticated requests", async () => {
    const res = await request(app).get("/api/v1/clients");
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it("rejects state-changing requests without a CSRF token", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({ email: "admin@test.local", password: PASSWORD });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("CSRF_INVALID");
  });

  it("rejects a wrong password without revealing which part was wrong", async () => {
    const agent = request.agent(app);
    const csrf = (await agent.get("/api/v1/auth/csrf")).body.data.csrfToken;
    const res = await agent.post("/api/v1/auth/login").set("X-CSRF-Token", csrf).send({ email: "admin@test.local", password: "wrong-password" });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe("Invalid email or password");
  });

  it("sets an httpOnly session cookie on login", async () => {
    const agent = request.agent(app);
    const csrf = (await agent.get("/api/v1/auth/csrf")).body.data.csrfToken;
    const res = await agent.post("/api/v1/auth/login").set("X-CSRF-Token", csrf).send({ email: "admin@test.local", password: PASSWORD });
    expect(res.status).toBe(200);
    const cookies = ([] as string[]).concat(res.headers["set-cookie"] ?? []);
    expect(cookies.find((c) => c.startsWith("agency_session="))).toMatch(/HttpOnly/);
    expect(res.body.data.user).not.toHaveProperty("passwordHash");
  });

  it("enforces roles: managers reach everything except the admin-only security switch", async () => {
    const manager = await login("manager@test.local");
    for (const url of ["/api/v1/clients", "/api/v1/invoices", "/api/v1/payments", "/api/v1/payroll", "/api/v1/employees", "/api/v1/dashboard", "/api/v1/auth/users"]) {
      expect((await manager.agent.get(url)).status, url).toBe(200);
    }
    expect((await manager.agent.get("/api/v1/settings/security")).status).toBe(403);
  });

  it("enforces roles: employees cannot reach money", async () => {
    await createUser("EMPLOYEE", "staff-employee@test.local");
    const employee = await login("staff-employee@test.local");
    expect((await employee.agent.get("/api/v1/clients")).status).toBe(200);
    for (const url of ["/api/v1/invoices", "/api/v1/payments", "/api/v1/expenses", "/api/v1/income", "/api/v1/payroll", "/api/v1/employees", "/api/v1/dashboard"]) {
      expect((await employee.agent.get(url)).status, url).toBe(403);
    }
  });

  it("hides client pricing from employees and keeps it when they edit the client", async () => {
    const client = await prisma.client.create({ data: { name: "Priced client", monthlyRetainer: "25000" } });
    await createUser("EMPLOYEE", "pricing-employee@test.local");
    const employee = await login("pricing-employee@test.local");
    const seen = (await employee.agent.get(`/api/v1/clients/${client.id}`)).body.data;
    expect(seen.monthlyRetainer).toBeNull();
    const { id, createdAt, updatedAt, archivedAt, services, ...form } = seen;
    void [id, createdAt, updatedAt, archivedAt, services];
    const saved = await put(employee, `/api/v1/clients/${client.id}`, { ...form, phone: "9999999999" });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    const stored = await prisma.client.findUniqueOrThrow({ where: { id: client.id } });
    expect(stored.phone).toBe("9999999999");
    expect(stored.monthlyRetainer?.toFixed(2)).toBe("25000.00");
  });

  it("enforces roles: accountants cannot reach payroll, employees or company settings", async () => {
    const accountant = await login("accountant@test.local");
    expect((await accountant.agent.get("/api/v1/invoices")).status).toBe(200);
    expect((await accountant.agent.get("/api/v1/payroll")).status).toBe(403);
    expect((await accountant.agent.get("/api/v1/employees")).status).toBe(403);
    const res = await accountant.agent.put("/api/v1/settings/company").set("X-CSRF-Token", accountant.csrf).send({});
    expect(res.status).toBe(403);
  });

  it("revokes existing sessions after a password change", async () => {
    const first = await login("accountant@test.local");
    const second = await login("accountant@test.local");
    const change = await post(first, "/api/v1/auth/change-password", { currentPassword: PASSWORD, newPassword: "a-brand-new-password-123" });
    expect(change.status).toBe(200);
    expect((await second.agent.get("/api/v1/auth/me")).status).toBe(401);
    expect((await first.agent.get("/api/v1/auth/me")).status).toBe(200); // the session that changed it gets a fresh token
  });

  it("returns 404 for unknown ids instead of leaking data", async () => {
    const admin = await login("admin@test.local");
    const res = await admin.agent.get("/api/v1/clients/00000000-0000-4000-8000-000000000000");
    expect(res.status).toBe(404);
  });
});
