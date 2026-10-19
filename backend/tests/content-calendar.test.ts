import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/db/prisma";
import { createUser, login, post, put, resetDatabase, type Session } from "./helpers";

const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

describe("content calendars", () => {
  let admin: Session;
  let employee: Session;
  let accountant: Session;
  let client: Session;
  let otherClient: Session;
  let clientId: string;
  let generatedId: string;
  let uploadedId: string;
  let hiddenId: string;

  beforeAll(async () => {
    await resetDatabase();
    await createUser("ADMIN", "admin@test.local");
    await createUser("ACCOUNTANT", "accountant@test.local");
    const emp = await prisma.employee.create({ data: { employeeCode: "E1", fullName: "Riya", joiningDate: new Date("2025-01-01") } });
    await createUser("EMPLOYEE", "employee@test.local", emp.id);
    const acme = await prisma.client.create({ data: { name: "Acme Bakery" } });
    const other = await prisma.client.create({ data: { name: "Other Co" } });
    clientId = acme.id;
    await prisma.user.create({ data: { email: "acme@test.local", name: "Acme", role: "CLIENT", clientId: acme.id, passwordHash: (await prisma.user.findFirstOrThrow()).passwordHash } });
    await prisma.user.create({ data: { email: "other@test.local", name: "Other", role: "CLIENT", clientId: other.id, passwordHash: (await prisma.user.findFirstOrThrow()).passwordHash } });
    admin = await login("admin@test.local");
    employee = await login("employee@test.local");
    accountant = await login("accountant@test.local");
    client = await login("acme@test.local");
    otherClient = await login("other@test.local");

    const event = (title: string, eventType: string, start: string) => post(admin, "/api/v1/calendar/events", { title, eventType, allDay: true, start, end: start, clientId });
    expect((await event("Diwali offer post", "POST_SCHEDULE", "2026-11-05")).status).toBe(201);
    expect((await event("Internal content review", "MEETING", "2026-11-06")).status).toBe(201);
    expect((await event("Poster design deadline", "DESIGN_DEADLINE", "2026-11-03")).status).toBe(201);
    await prisma.creativeAsset.create({ data: { clientId, title: "Diwali reel", contentType: "REEL", platform: "INSTAGRAM", status: "DRAFT", publishDate: new Date("2026-11-10") } });
    await prisma.adCampaign.create({ data: { clientId, name: "Diwali boost", platform: "META", campaignType: "POST_BOOST", startDate: new Date("2026-11-11"), spend: "5000" } });
  });

  it("previews only client-safe entries for the month", async () => {
    const res = await admin.agent.get("/api/v1/content-calendars/preview").query({ clientId, period: "2026-11" });
    expect(res.status).toBe(200);
    expect(res.body.data.map((e: { date: string; title: string }) => `${e.date} ${e.title}`)).toEqual(["2026-11-05 Diwali offer post", "2026-11-10 Diwali reel", "2026-11-11 Diwali boost"]);
    // No internal meetings, design deadlines, spend or creative status.
    expect(JSON.stringify(res.body.data)).not.toMatch(/5000|draft|Internal|deadline/i);
  });

  it("creates a calendar from the app calendar and renders it as a PDF", async () => {
    const res = await post(admin, "/api/v1/content-calendars", { clientId, period: "2026-11", title: "November content plan", notes: "Festive month" });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ kind: "GENERATED", sharedWithClient: true, file: null });
    generatedId = res.body.data.id;
    const pdf = await admin.agent.get(`/api/v1/content-calendars/${generatedId}/file`).query({ download: "true" }).buffer(true);
    expect(pdf.status).toBe(200);
    expect(pdf.headers["content-type"]).toBe("application/pdf");
    expect(pdf.headers["content-disposition"]).toContain("attachment");
    expect(pdf.body.subarray(0, 4).toString()).toBe("%PDF");
  });

  it("stores an uploaded file and can keep a calendar private", async () => {
    const uploaded = await employee.agent
      .post("/api/v1/content-calendars")
      .set("X-CSRF-Token", employee.csrf)
      .field("clientId", clientId)
      .field("period", "2026-12")
      .field("title", "December plan")
      .attach("file", PDF, { filename: "december.pdf", contentType: "application/pdf" });
    expect(uploaded.status).toBe(201);
    expect(uploaded.body.data).toMatchObject({ kind: "UPLOADED", file: { originalName: "december.pdf" } });
    uploadedId = uploaded.body.data.id;

    const hidden = await post(admin, "/api/v1/content-calendars", { clientId, period: "2027-01", title: "Draft January plan", sharedWithClient: false });
    hiddenId = hidden.body.data.id;
    expect(hidden.body.data.sharedWithClient).toBe(false);
    expect((await post(accountant, "/api/v1/content-calendars", { clientId, period: "2027-01", title: "x" })).status).toBe(403);
  });

  it("shows the client only their shared calendars, with view and download", async () => {
    const list = await client.agent.get("/api/v1/portal/content-calendars");
    expect(list.body.data.map((c: { title: string }) => c.title)).toEqual(["December plan", "November content plan"]);
    expect(list.body.data[0]).not.toHaveProperty("createdBy");

    const file = await client.agent.get(`/api/v1/portal/content-calendars/${uploadedId}/file`).buffer(true);
    expect(file.status).toBe(200);
    expect(file.headers["content-disposition"]).toContain("inline");
    expect((await client.agent.get(`/api/v1/portal/content-calendars/${generatedId}/file`).query({ download: "true" })).status).toBe(200);
    // Shared uploaded files also open through /files for the right client only.
    const fileId = list.body.data[0].file.id;
    expect((await client.agent.get(`/api/v1/files/${fileId}`)).status).toBe(200);
    expect((await otherClient.agent.get(`/api/v1/files/${fileId}`)).status).toBe(404);

    expect((await client.agent.get(`/api/v1/portal/content-calendars/${hiddenId}/file`)).status).toBe(404);
    expect((await otherClient.agent.get(`/api/v1/portal/content-calendars/${generatedId}/file`)).status).toBe(404);
    expect((await otherClient.agent.get("/api/v1/portal/content-calendars")).body.data).toEqual([]);
  });

  it("hides a calendar from the client once it is unshared", async () => {
    await put(admin, `/api/v1/content-calendars/${uploadedId}`, { period: "2026-12", title: "December plan", sharedWithClient: false });
    expect((await client.agent.get("/api/v1/portal/content-calendars")).body.data.map((c: { title: string }) => c.title)).toEqual(["November content plan"]);
    const fileId = (await prisma.contentCalendar.findUniqueOrThrow({ where: { id: uploadedId } })).fileId!;
    expect((await client.agent.get(`/api/v1/files/${fileId}`)).status).toBe(404);
  });

  it("sends an employee's delete for approval", async () => {
    const asked = await employee.agent.delete(`/api/v1/content-calendars/${generatedId}`).set("X-CSRF-Token", employee.csrf);
    expect(asked.status).toBe(202);
    expect(asked.body.data.request.title).toBe('Delete content calendar "November content plan" (2026-11)');
    expect((await post(admin, `/api/v1/approvals/${asked.body.data.request.id}/approve`, {})).status).toBe(200);
    expect(await prisma.contentCalendar.findUnique({ where: { id: generatedId } })).toBeNull();
  });
});
