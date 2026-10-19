import request from "supertest";
import type TestAgent from "supertest/lib/agent";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/db/prisma";
import { devOutbox } from "../src/services/mail.service";
import { app, createUser, login, PASSWORD, put, resetDatabase } from "./helpers";

async function startLogin(email = "otp@test.local", password = PASSWORD) {
  const agent = request.agent(app);
  const csrf = (await agent.get("/api/v1/auth/csrf")).body.data.csrfToken;
  const res = await agent.post("/api/v1/auth/login").set("X-CSRF-Token", csrf).send({ email, password });
  return { agent, csrf, res };
}

function lastCode(to: string) {
  const mail = [...devOutbox].reverse().find((m) => m.to === to);
  return mail?.text.match(/\b(\d{6})\b/)?.[1] ?? null;
}

const post = (agent: TestAgent, csrf: string, url: string, body: object) => agent.post(url).set("X-CSRF-Token", csrf).send(body);

describe("email OTP sign-in", () => {
  beforeAll(async () => {
    process.env.LOGIN_OTP_ENABLED = "true";
    await resetDatabase();
    await createUser("ADMIN", "otp@test.local");
  });

  afterAll(() => {
    process.env.LOGIN_OTP_ENABLED = "false";
  });

  it("does not start a session after the password alone", async () => {
    const { agent, res } = await startLogin();
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ otpRequired: true, emailHint: "ot••@test.local", expiresInMinutes: 10 });
    expect(res.headers["set-cookie"]?.toString() ?? "").not.toContain("agency_session=");
    expect((await agent.get("/api/v1/auth/me")).status).toBe(401);
  });

  it("emails a 6-digit code and signs in with it, once", async () => {
    const { agent, csrf, res } = await startLogin();
    const code = lastCode("otp@test.local");
    expect(code).toMatch(/^\d{6}$/);
    const challenge = await prisma.loginChallenge.findUniqueOrThrow({ where: { id: res.body.data.challengeId } });
    expect(challenge.codeHash).not.toContain(code!); // only a hash is stored

    const ok = await post(agent, csrf, "/api/v1/auth/verify-otp", { challengeId: res.body.data.challengeId, code });
    expect(ok.status).toBe(200);
    expect((await agent.get("/api/v1/auth/me")).status).toBe(200);

    const replay = await post(agent, ok.body.data.csrfToken, "/api/v1/auth/verify-otp", { challengeId: res.body.data.challengeId, code });
    expect(replay.status).toBe(400);
  });

  it("locks the code after 5 wrong attempts", async () => {
    const { agent, csrf, res } = await startLogin();
    const challengeId = res.body.data.challengeId;
    const code = lastCode("otp@test.local")!;
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 1; i <= 4; i++) {
      const r = await post(agent, csrf, "/api/v1/auth/verify-otp", { challengeId, code: wrong });
      expect(r.body.error.message).toContain(`${5 - i} attempt`);
    }
    expect((await post(agent, csrf, "/api/v1/auth/verify-otp", { challengeId, code: wrong })).body.error.message).toContain("Too many wrong codes");
    // Even the right code no longer works.
    expect((await post(agent, csrf, "/api/v1/auth/verify-otp", { challengeId, code })).status).toBe(400);
  });

  it("rejects expired codes", async () => {
    const { agent, csrf, res } = await startLogin();
    await prisma.loginChallenge.update({ where: { id: res.body.data.challengeId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const r = await post(agent, csrf, "/api/v1/auth/verify-otp", { challengeId: res.body.data.challengeId, code: lastCode("otp@test.local") });
    expect(r.status).toBe(400);
    expect(r.body.error.message).toContain("expired");
  });

  it("limits resends and makes the old code invalid", async () => {
    const { agent, csrf, res } = await startLogin();
    const challengeId = res.body.data.challengeId;
    const first = lastCode("otp@test.local");
    expect((await post(agent, csrf, "/api/v1/auth/resend-otp", { challengeId })).status).toBe(429); // too soon

    await prisma.loginChallenge.update({ where: { id: challengeId }, data: { lastSentAt: new Date(Date.now() - 61_000) } });
    expect((await post(agent, csrf, "/api/v1/auth/resend-otp", { challengeId })).status).toBe(200);
    const second = lastCode("otp@test.local");
    if (first !== second) expect((await post(agent, csrf, "/api/v1/auth/verify-otp", { challengeId, code: first })).status).toBe(400);
    expect((await post(agent, csrf, "/api/v1/auth/verify-otp", { challengeId, code: second })).status).toBe(200);
  });

  it("still rejects a wrong password without sending any email", async () => {
    const before = devOutbox.length;
    const { res } = await startLogin("otp@test.local", "wrong-password");
    expect(res.status).toBe(401);
    expect(devOutbox.length).toBe(before);
  });
});

describe("admin switch for the sign-in code", () => {
  beforeAll(async () => {
    await resetDatabase();
    await createUser("ADMIN", "switch-admin@test.local");
    await createUser("MANAGER", "switch-manager@test.local");
  });

  afterAll(() => {
    process.env.LOGIN_OTP_ENABLED = "false";
  });

  it("lets only admins read and change it, and login follows the setting", async () => {
    // Sessions are created while the server-level switch is off, then the switch is turned back on.
    const admin = await login("switch-admin@test.local");
    const manager = await login("switch-manager@test.local");
    process.env.LOGIN_OTP_ENABLED = "true";

    expect((await manager.agent.get("/api/v1/settings/security")).status).toBe(403);
    expect((await put(manager, "/api/v1/settings/security", { loginOtpEnabled: false })).status).toBe(403);

    const read = await admin.agent.get("/api/v1/settings/security");
    expect(read.body.data).toMatchObject({ loginOtpEnabled: true, serverAllowsOtp: true });
    expect((await startLogin("switch-manager@test.local")).res.body.data.otpRequired).toBe(true);

    const off = await put(admin, "/api/v1/settings/security", { loginOtpEnabled: false });
    expect(off.status).toBe(200);
    expect(off.body.data.loginOtpEnabled).toBe(false);
    const direct = await startLogin("switch-manager@test.local");
    expect(direct.res.body.data.otpRequired).toBe(false);
    expect((await direct.agent.get("/api/v1/auth/me")).status).toBe(200);

    expect((await put(admin, "/api/v1/settings/security", { loginOtpEnabled: "no" })).status).toBe(400);
    const log = await prisma.auditLog.findFirst({ where: { summary: "Email code at sign-in turned off" } });
    expect(log).not.toBeNull();

    await put(admin, "/api/v1/settings/security", { loginOtpEnabled: true });
    expect((await startLogin("switch-manager@test.local")).res.body.data.otpRequired).toBe(true);
  });

  it("is always off when the server switch is off", async () => {
    process.env.LOGIN_OTP_ENABLED = "false";
    const admin = await login("switch-admin@test.local");
    expect((await admin.agent.get("/api/v1/settings/security")).body.data).toMatchObject({ loginOtpEnabled: true, serverAllowsOtp: false });
    expect((await startLogin("switch-manager@test.local")).res.body.data.otpRequired).toBe(false);
  });
});
