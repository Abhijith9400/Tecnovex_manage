import argon2 from "argon2";
import request from "supertest";
import type TestAgent from "supertest/lib/agent";
import { createApp } from "../src/app";
import { prisma } from "../src/db/prisma";
import type { Role } from "../src/generated/prisma/enums";

export const app = createApp();
export const PASSWORD = "correct-horse-battery-staple";

/** Empties every table (test database only). */
export async function resetDatabase() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
  await prisma.companySettings.create({ data: { id: 1, legalName: "Test Agency LLP", invoicePrefix: "INV", invoiceUseFinancialYear: false } });
}

export async function createUser(role: Role, email = `${role.toLowerCase()}@test.local`, employeeId?: string) {
  return prisma.user.create({ data: { email, name: role, role, employeeId, passwordHash: await argon2.hash(PASSWORD) } });
}

export interface Session {
  agent: TestAgent;
  csrf: string;
}

/** Logs in through the real endpoints (CSRF + cookie) and returns an agent that keeps the session. */
export async function login(email: string): Promise<Session> {
  const agent = request.agent(app);
  const first = await agent.get("/api/v1/auth/csrf");
  const res = await agent.post("/api/v1/auth/login").set("X-CSRF-Token", first.body.data.csrfToken).send({ email, password: PASSWORD });
  if (res.status !== 200) throw new Error(`Login failed: ${JSON.stringify(res.body)}`);
  return { agent, csrf: res.body.data.csrfToken };
}

export function post(session: Session, url: string, body?: object) {
  return session.agent.post(url).set("X-CSRF-Token", session.csrf).send(body);
}

export function put(session: Session, url: string, body?: object) {
  return session.agent.put(url).set("X-CSRF-Token", session.csrf).send(body);
}

export async function createClientWithService(session: Session, unitPrice = "10000.00", taxRate = "18") {
  const client = await post(session, "/api/v1/clients", {
    name: "Test Client",
    billingType: "RETAINER",
    billingCycle: "MONTHLY",
    paymentTermsDays: 15,
    status: "ACTIVE",
    country: "India",
  });
  await post(session, `/api/v1/clients/${client.body.data.id}/services`, { name: "Retainer", quantity: "1", unitPrice, taxRate, isRecurring: true });
  return client.body.data.id as string;
}
