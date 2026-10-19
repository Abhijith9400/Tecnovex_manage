import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/db/prisma";
import { createUser, login, post, resetDatabase, type Session } from "./helpers";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const today = new Date(`${iso(new Date())}T00:00:00Z`);
const daysFromToday = (n: number) => new Date(today.getTime() + n * 86_400_000);

describe("employee and client dashboards", () => {
  let admin: Session;
  let riya: Session;
  let acme: Session;
  let clientId: string;

  beforeAll(async () => {
    await resetDatabase();
    await createUser("ADMIN", "admin@test.local");
    admin = await login("admin@test.local");
    const riyaEmp = await prisma.employee.create({ data: { employeeCode: "E1", fullName: "Riya", designation: "Designer", joiningDate: new Date("2025-01-01") } });
    const kabir = await prisma.employee.create({ data: { employeeCode: "E2", fullName: "Kabir", joiningDate: new Date("2025-01-01") } });
    await createUser("EMPLOYEE", "riya@test.local", riyaEmp.id);
    riya = await login("riya@test.local");
    const client = await prisma.client.create({ data: { name: "Acme Bakery" } });
    clientId = client.id;
    await prisma.user.create({ data: { email: "acme@test.local", name: "Acme", role: "CLIENT", clientId, passwordHash: (await prisma.user.findFirstOrThrow()).passwordHash } });
    acme = await login("acme@test.local");

    // Riya: 2 open tasks (1 overdue), 1 done today; Kabir's task must not count.
    await prisma.task.createMany({
      data: [
        { title: "Poster", assigneeId: riyaEmp.id, clientId, status: "TODO", dueDate: daysFromToday(-2) },
        { title: "Reel", assigneeId: riyaEmp.id, clientId, status: "IN_PROGRESS", dueDate: daysFromToday(3) },
        { title: "Logo", assigneeId: riyaEmp.id, status: "DONE", completedAt: new Date() },
        { title: "Not mine", assigneeId: kabir.id, status: "TODO" },
      ],
    });
    await prisma.workLog.createMany({
      data: [
        { employeeId: riyaEmp.id, clientId, workDate: today, minutes: 150, taskType: "DESIGN", title: "Poster drafts" },
        { employeeId: riyaEmp.id, workDate: today, minutes: 30, taskType: "ADMIN", title: "Timesheets" },
        { employeeId: kabir.id, clientId, workDate: today, minutes: 600, taskType: "DESIGN", title: "x" },
      ],
    });

    await prisma.creativeAsset.createMany({
      data: [
        { clientId, title: "Live post", contentType: "POSTER", platform: "INSTAGRAM", status: "PUBLISHED" },
        { clientId, title: "Ready reel", contentType: "REEL", platform: "INSTAGRAM", status: "APPROVED" },
        { clientId, title: "Secret draft", contentType: "REEL", platform: "FACEBOOK", status: "DRAFT" },
      ],
    });
    await prisma.adCampaign.create({
      data: { clientId, name: "Boost", platform: "META", campaignType: "POST_BOOST", status: "ACTIVE", startDate: today, spend: "7777", impressions: 12000, reach: 9000, clicks: 300, results: 40 },
    });
    const start = iso(daysFromToday(1));
    await post(admin, "/api/v1/calendar/events", { title: "Offer post", eventType: "POST_SCHEDULE", allDay: true, start, end: start, clientId });
    await post(admin, "/api/v1/calendar/events", { title: "Internal sync", eventType: "MEETING", allDay: true, start, end: start, clientId });
  });

  it("shows an employee only their own work", async () => {
    const res = await riya.agent.get("/api/v1/dashboard/me");
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.employee).toEqual({ name: "Riya", designation: "Designer" });
    expect(d.tasks).toMatchObject({ todo: 1, inProgress: 1, open: 2, overdue: 1, dueThisWeek: 1, doneThisMonth: 1 });
    expect(d.hours.thisMonth).toBe(3);
    expect(d.hours.byClient).toEqual([
      { name: "Acme Bakery", hours: 2.5 },
      { name: "Internal work", hours: 0.5 },
    ]);
    expect(d.hours.daily).toHaveLength(14);
    expect(d.hours.daily.at(-1)).toEqual({ date: iso(today), hours: 3 });
    expect(d.weeks.at(-1)).toMatchObject({ completed: 1, hours: 3 });
    expect(d.myTasks.map((t: { title: string }) => t.title)).toEqual(["Poster", "Reel"]);
    expect(d.myTasks[0].overdue).toBe(true);
  });

  it("is only for employees", async () => {
    expect((await admin.agent.get("/api/v1/dashboard/me")).status).toBe(403);
    expect((await acme.agent.get("/api/v1/dashboard/me")).status).toBe(403);
  });

  it("shows a client what was delivered, without drafts or ad spend", async () => {
    const res = await acme.agent.get("/api/v1/portal/dashboard");
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.creatives).toMatchObject({ delivered: 2, published: 1, readyToPublish: 1, thisMonth: 2 });
    expect(d.creatives.byType).toEqual(expect.arrayContaining([{ type: "POSTER", count: 1 }, { type: "REEL", count: 1 }]));
    expect(d.creatives.byPlatform).toEqual([{ platform: "INSTAGRAM", count: 2 }]);
    expect(d.creatives.recent.map((c: { title: string }) => c.title)).not.toContain("Secret draft");
    expect(d.ads).toMatchObject({ active: 1, impressions: 12000, reach: 9000, clicks: 300, results: 40 });
    // The campaign starts today, so it counts as upcoming; the internal meeting never shows.
    expect(d.upcoming.map((e: { title: string }) => e.title)).toEqual(["Boost", "Offer post"]);
    expect(JSON.stringify(d)).not.toMatch(/7777|Secret draft|Internal sync/);
    expect((await riya.agent.get("/api/v1/portal/dashboard")).status).toBe(403);
  });
});
