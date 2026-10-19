import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/db/prisma";
import { devOutbox } from "../src/services/mail.service";
import { app, createUser, login, PASSWORD, resetDatabase } from "./helpers";

const NEW_PASSWORD = "a-brand-new-password-2026";

async function anon() {
  const agent = request.agent(app);
  const csrf = (await agent.get("/api/v1/auth/csrf")).body.data.csrfToken as string;
  return { agent, csrf, post: (url: string, body: object) => agent.post(url).set("X-CSRF-Token", csrf).send(body) };
}

function lastCode(to: string) {
  const mail = [...devOutbox].reverse().find((m) => m.to === to);
  return mail?.text.match(/\b(\d{6})\b/)?.[1] ?? null;
}

describe("forgot password", () => {
  beforeAll(async () => {
    await resetDatabase();
    await createUser("MANAGER", "forgot@test.local");
    const disabled = await createUser("MANAGER", "disabled@test.local");
    await prisma.user.update({ where: { id: disabled.id }, data: { isActive: false } });
  });

  it("answers the same way for unknown and disabled emails, without sending anything", async () => {
    const before = devOutbox.length;
    const { post } = await anon();
    const unknown = await post("/api/v1/auth/forgot-password", { email: "nobody@test.local" });
    const disabled = await post("/api/v1/auth/forgot-password", { email: "disabled@test.local" });
    for (const res of [unknown, disabled]) {
      expect(res.status).toBe(200);
      expect(Object.keys(res.body.data).sort()).toEqual(["emailHint", "expiresInMinutes", "resendInSeconds", "resetId"]);
    }
    expect(devOutbox.length).toBe(before);
    // A made-up reset id simply fails like a wrong code.
    expect((await post("/api/v1/auth/reset-password", { resetId: unknown.body.data.resetId, code: "123456", newPassword: NEW_PASSWORD })).status).toBe(400);
  });

  it("emails a reset-specific code that cannot be used to sign in", async () => {
    const { post } = await anon();
    const res = await post("/api/v1/auth/forgot-password", { email: "forgot@test.local" });
    const mail = [...devOutbox].reverse().find((m) => m.to === "forgot@test.local")!;
    expect(mail.subject).toContain("password reset code");
    // Using the reset id/code on the sign-in endpoint fails.
    const misuse = await post("/api/v1/auth/verify-otp", { challengeId: res.body.data.resetId, code: lastCode("forgot@test.local") });
    expect(misuse.status).toBe(400);
  });

  it("resets the password, signs out other sessions, and the old password stops working", async () => {
    const existing = await login("forgot@test.local");
    expect((await existing.agent.get("/api/v1/auth/me")).status).toBe(200);

    const { post } = await anon();
    const start = await post("/api/v1/auth/forgot-password", { email: "forgot@test.local" });
    const code = lastCode("forgot@test.local");

    const weak = await post("/api/v1/auth/reset-password", { resetId: start.body.data.resetId, code, newPassword: "short" });
    expect(weak.status).toBe(400);

    const ok = await post("/api/v1/auth/reset-password", { resetId: start.body.data.resetId, code, newPassword: NEW_PASSWORD });
    expect(ok.status).toBe(200);

    expect((await existing.agent.get("/api/v1/auth/me")).status).toBe(401);
    const again = await anon();
    expect((await again.post("/api/v1/auth/login", { email: "forgot@test.local", password: PASSWORD })).status).toBe(401);
    expect((await again.post("/api/v1/auth/login", { email: "forgot@test.local", password: NEW_PASSWORD })).status).toBe(200);
    // The code is single-use.
    expect((await post("/api/v1/auth/reset-password", { resetId: start.body.data.resetId, code, newPassword: "yet-another-password-99" })).status).toBe(400);
    expect(await prisma.auditLog.count({ where: { action: "PASSWORD_RESET" } })).toBe(1);
  });

  it("cancels the reset after 5 wrong codes", async () => {
    const { post } = await anon();
    const start = await post("/api/v1/auth/forgot-password", { email: "forgot@test.local" });
    const code = lastCode("forgot@test.local")!;
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) await post("/api/v1/auth/reset-password", { resetId: start.body.data.resetId, code: wrong, newPassword: "irrelevant-password-1" });
    const late = await post("/api/v1/auth/reset-password", { resetId: start.body.data.resetId, code, newPassword: "irrelevant-password-1" });
    expect(late.status).toBe(400);
  });
});
