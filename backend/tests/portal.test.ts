import { beforeAll, describe, expect, it } from "vitest";
import { createUser, login, post, resetDatabase, type Session } from "./helpers";

// 1x1 PNG
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

describe("client portal", () => {
  let admin: Session;
  let portal: Session;
  let clientA: string;
  let clientB: string;
  const ids: Record<string, { id: string; fileId: string }> = {};

  async function makeClient(name: string) {
    const res = await post(admin, "/api/v1/clients", { name, billingType: "RETAINER", billingCycle: "MONTHLY", paymentTermsDays: 15, status: "ACTIVE", country: "India" });
    return res.body.data.id as string;
  }

  async function upload(clientId: string, title: string, status: string, files = 1) {
    let req = admin.agent
      .post(`/api/v1/clients/${clientId}/creatives`)
      .set("X-CSRF-Token", admin.csrf)
      .field("title", title)
      .field("contentType", files > 1 ? "CAROUSEL" : "POSTER")
      .field("platform", "INSTAGRAM")
      .field("status", status)
      .field("internalNotes", "secret internal note");
    for (let i = 0; i < files; i++) req = req.attach("files", PNG, { filename: `slide-${i + 1}.png`, contentType: "image/png" });
    const res = await req;
    expect(res.status).toBe(201);
    ids[title] = { id: res.body.data.id, fileId: res.body.data.files[0].id };
  }

  beforeAll(async () => {
    await resetDatabase();
    await createUser("ADMIN", "admin@test.local");
    admin = await login("admin@test.local");
    clientA = await makeClient("Client A");
    clientB = await makeClient("Client B");
    await upload(clientA, "A approved carousel", "APPROVED", 2);
    await upload(clientA, "A published", "PUBLISHED");
    await upload(clientA, "A draft", "DRAFT");
    await upload(clientB, "B approved", "APPROVED");

    const created = await post(admin, "/api/v1/auth/users", { name: "Client A login", email: "a@client.test", role: "CLIENT", password: "correct-horse-battery-staple", clientId: clientA });
    expect(created.status).toBe(201);
    portal = await login("a@client.test");
  });

  it("requires a linked client for client logins", async () => {
    const res = await post(admin, "/api/v1/auth/users", { name: "Unlinked", email: "x@client.test", role: "CLIENT", password: "correct-horse-battery-staple" });
    expect(res.status).toBe(400);
  });

  it("lists only the client's own approved and published creatives, without internal notes", async () => {
    const res = await portal.agent.get("/api/v1/portal/creatives");
    expect(res.status).toBe(200);
    const titles = res.body.data.map((c: { title: string }) => c.title).sort();
    expect(titles).toEqual(["A approved carousel", "A published"]);
    expect(res.body.data[0]).not.toHaveProperty("internalNotes");
    expect(res.body.data[0]).not.toHaveProperty("uploadedBy");
  });

  it("downloads own approved files but hides drafts and other clients' files", async () => {
    expect((await portal.agent.get(`/api/v1/files/${ids["A published"].fileId}/download`)).status).toBe(200);
    expect((await portal.agent.get(`/api/v1/files/${ids["A draft"].fileId}`)).status).toBe(404);
    expect((await portal.agent.get(`/api/v1/files/${ids["B approved"].fileId}`)).status).toBe(404);
    expect((await portal.agent.get(`/api/v1/portal/creatives/${ids["B approved"].id}`)).status).toBe(404);
    expect((await portal.agent.get(`/api/v1/portal/creatives/${ids["A draft"].id}`)).status).toBe(404);
  });

  it("streams all files of a creative as a ZIP", async () => {
    const res = await portal.agent.get(`/api/v1/portal/creatives/${ids["A approved carousel"].id}/download`).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on("data", (c: Buffer) => chunks.push(c));
      r.on("end", () => cb(null, Buffer.concat(chunks)));
    });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/zip");
    const zip = res.body as Buffer;
    expect(zip.subarray(0, 2).toString()).toBe("PK");
    expect(zip.includes("slide-1.png")).toBe(true);
    expect(zip.includes("slide-2.png")).toBe(true);
  });

  it("blocks client logins from staff and finance areas", async () => {
    for (const url of ["/api/v1/clients", "/api/v1/creatives", "/api/v1/invoices", "/api/v1/payments", "/api/v1/dashboard", "/api/v1/settings/company", "/api/v1/agreements"]) {
      expect((await portal.agent.get(url)).status, url).toBe(403);
    }
    expect((await portal.agent.get(`/api/v1/clients/${clientA}/creatives`)).status).toBe(403);
  });

  it("is not available to staff accounts", async () => {
    expect((await admin.agent.get("/api/v1/portal/creatives")).status).toBe(403);
  });
});
