import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/db/prisma";
import { createUser, login, post, resetDatabase, type Session } from "./helpers";

describe("work dashboard", () => {
  let admin: Session;
  let manager: Session;
  let accountant: Session;

  beforeAll(async () => {
    await resetDatabase();
    await createUser("ADMIN", "admin@test.local");
    await createUser("MANAGER", "manager@test.local");
    await createUser("ACCOUNTANT", "accountant@test.local");
    admin = await login("admin@test.local");
    manager = await login("manager@test.local");
    accountant = await login("accountant@test.local");

    const alice = (await post(admin, "/api/v1/employees", { fullName: "Alice", joiningDate: "2025-01-01", status: "ACTIVE" })).body.data.id;
    const bob = (await post(admin, "/api/v1/employees", { fullName: "Bob", joiningDate: "2025-01-01", status: "ACTIVE" })).body.data.id;
    const client = await prisma.client.create({ data: { name: "Acme Foods" } });

    await post(admin, "/api/v1/tasks", { title: "Overdue poster", assigneeId: alice, taskType: "DESIGN", priority: "HIGH", dueDate: "2020-01-01", clientId: client.id });
    await post(admin, "/api/v1/tasks", { title: "Reel edit", assigneeId: alice, taskType: "VIDEO_EDITING", priority: "MEDIUM" });
    const review = (await post(admin, "/api/v1/tasks", { title: "Caption", assigneeId: bob, taskType: "CONTENT_WRITING", priority: "LOW" })).body.data.id;
    const done = (await post(admin, "/api/v1/tasks", { title: "Logo", assigneeId: bob, taskType: "DESIGN", priority: "LOW" })).body.data.id;
    await prisma.task.update({ where: { id: review }, data: { status: "IN_REVIEW" } });
    await prisma.task.update({ where: { id: done }, data: { status: "DONE", completedAt: new Date() } });

    await prisma.creativeAsset.createMany({
      data: [
        { clientId: client.id, title: "Draft post", contentType: "POSTER", status: "DRAFT", publishDate: new Date("2020-01-01") },
        { clientId: client.id, title: "Approved reel", contentType: "REEL", status: "APPROVED" },
        { clientId: client.id, title: "Live post", contentType: "POSTER", status: "PUBLISHED" },
      ],
    });
  });

  it("is available to admins and managers only", async () => {
    expect((await accountant.agent.get("/api/v1/dashboard/work")).status).toBe(403);
    expect((await manager.agent.get("/api/v1/dashboard/work")).status).toBe(200);
    expect((await manager.agent.get("/api/v1/dashboard")).status).toBe(200);
  });

  it("summarises tasks, workload and creatives", async () => {
    const res = await admin.agent.get("/api/v1/dashboard/work");
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.tasks).toMatchObject({ todo: 2, inProgress: 0, inReview: 1, open: 3, overdue: 1, completedInPeriod: 1 });
    expect(d.team.map((t: { name: string; total: number; overdue: number }) => [t.name, t.total, t.overdue])).toEqual([
      ["Alice", 2, 1],
      ["Bob", 1, 0],
    ]);
    expect(d.trend).toHaveLength(8);
    expect(d.trend.at(-1)).toMatchObject({ created: 4, completed: 1 });
    expect(d.creatives).toMatchObject({ draft: 1, approved: 1, published: 1, pastPublishDate: 1 });
    expect(d.creatives.byClient).toEqual([expect.objectContaining({ name: "Acme Foods", draft: 1, approved: 1 })]);
    expect(d.overdueTasks).toEqual([expect.objectContaining({ title: "Overdue poster", assignee: { fullName: "Alice" }, client: { name: "Acme Foods" } })]);
    expect(d.overdueTasks[0].daysOverdue).toBeGreaterThan(0);
  });
});
