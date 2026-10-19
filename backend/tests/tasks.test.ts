import { beforeAll, describe, expect, it } from "vitest";
import { createUser, login, post, put, resetDatabase, type Session } from "./helpers";

describe("task assignment", () => {
  let admin: Session;
  let manager: Session;
  let accountant: Session;
  let alice: Session;
  let bob: Session;
  let aliceId: string;
  let bobId: string;
  let taskId: string;

  beforeAll(async () => {
    await resetDatabase();
    await createUser("ADMIN", "admin@test.local");
    await createUser("MANAGER", "manager@test.local");
    await createUser("ACCOUNTANT", "accountant@test.local");
    admin = await login("admin@test.local");
    manager = await login("manager@test.local");
    accountant = await login("accountant@test.local");
    aliceId = (await post(admin, "/api/v1/employees", { fullName: "Alice", joiningDate: "2025-01-01", status: "ACTIVE" })).body.data.id;
    bobId = (await post(admin, "/api/v1/employees", { fullName: "Bob", joiningDate: "2025-01-01", status: "ACTIVE" })).body.data.id;
    await createUser("EMPLOYEE", "alice@test.local", aliceId);
    await createUser("EMPLOYEE", "bob@test.local", bobId);
    alice = await login("alice@test.local");
    bob = await login("bob@test.local");
  });

  it("lets managers assign tasks", async () => {
    const res = await post(manager, "/api/v1/tasks", { title: "Design 3 Diwali posts", assigneeId: aliceId, taskType: "DESIGN", priority: "HIGH", dueDate: "2020-01-01", estimatedHours: 4 });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe("TODO");
    expect(res.body.data.overdue).toBe(true);
    taskId = res.body.data.id;
    await post(admin, "/api/v1/tasks", { title: "Edit reel", assigneeId: bobId, taskType: "VIDEO_EDITING", priority: "MEDIUM" });
  });

  it("lets employees create tasks, but not accountants", async () => {
    const created = await post(alice, "/api/v1/tasks", { title: "Employee task", assigneeId: bobId, taskType: "OTHER", priority: "LOW" });
    expect(created.status).toBe(201);
    expect((await accountant.agent.get("/api/v1/tasks")).status).toBe(403);
    // Clean up through the approval flow: the employee asks, a manager approves.
    const asked = await alice.agent.delete(`/api/v1/tasks/${created.body.data.id}`).set("X-CSRF-Token", alice.csrf);
    expect(asked.status).toBe(202);
    expect((await post(manager, `/api/v1/approvals/${asked.body.data.request.id}/approve`, {})).status).toBe(200);
    expect((await admin.agent.get(`/api/v1/tasks/${created.body.data.id}`)).status).toBe(404);
  });

  it("shows employees the whole team board", async () => {
    const all = await alice.agent.get("/api/v1/tasks");
    expect(all.body.data.map((t: { title: string }) => t.title).sort()).toEqual(["Design 3 Diwali posts", "Edit reel"]);
    expect((await bob.agent.get(`/api/v1/tasks/${taskId}`)).status).toBe(200);
  });

  it("lets employees update, edit and comment, while deletes wait for approval", async () => {
    const started = await post(alice, `/api/v1/tasks/${taskId}/status`, { status: "IN_PROGRESS" });
    expect(started.status).toBe(200);
    expect(started.body.data.startedAt).not.toBeNull();
    const edited = await put(alice, `/api/v1/tasks/${taskId}`, { title: "Design 3 Diwali posts", assigneeId: aliceId, taskType: "DESIGN", priority: "HIGH", status: "IN_PROGRESS", dueDate: "2020-01-01" });
    expect(edited.status).toBe(200);
    const asked = await alice.agent.delete(`/api/v1/tasks/${taskId}`).set("X-CSRF-Token", alice.csrf);
    expect(asked.status).toBe(202);
    expect((await alice.agent.get(`/api/v1/tasks/${taskId}`)).status).toBe(200);
    // Asking twice doesn't create a second request, and the employee can't approve it themselves.
    expect((await alice.agent.delete(`/api/v1/tasks/${taskId}`).set("X-CSRF-Token", alice.csrf)).body.data.request.id).toBe(asked.body.data.request.id);
    expect((await post(alice, `/api/v1/approvals/${asked.body.data.request.id}/approve`, {})).status).toBe(403);
    expect((await post(manager, `/api/v1/approvals/${asked.body.data.request.id}/reject`, { note: "Still needed" })).status).toBe(200);
    expect((await alice.agent.get(`/api/v1/tasks/${taskId}`)).status).toBe(200);
    const commented = await post(alice, `/api/v1/tasks/${taskId}/comments`, { body: "First draft shared" });
    expect(commented.body.data.comments).toHaveLength(1);
  });

  it("tracks hours logged against a task and blocks logging on someone else's task", async () => {
    const log = await post(alice, "/api/v1/work-logs", { workDate: "2026-09-05", hours: 2.5, taskType: "DESIGN", title: "Poster drafts", taskId });
    expect(log.status).toBe(201);
    expect((await post(bob, "/api/v1/work-logs", { workDate: "2026-09-05", hours: 1, taskType: "DESIGN", title: "x", taskId })).status).toBe(400);
    const task = await alice.agent.get(`/api/v1/tasks/${taskId}`);
    expect(task.body.data.loggedHours).toBe("2.50");
  });

  it("keeps a readable history of every change, in order", async () => {
    const created = await post(manager, "/api/v1/tasks", { title: "History check", assigneeId: aliceId, taskType: "DESIGN", priority: "MEDIUM" });
    const id = created.body.data.id;
    await put(manager, `/api/v1/tasks/${id}`, { title: "History check", assigneeId: aliceId, taskType: "DESIGN", priority: "HIGH", dueDate: "2026-12-01" });
    await post(alice, `/api/v1/tasks/${id}/status`, { status: "IN_PROGRESS" });
    await post(alice, `/api/v1/tasks/${id}/comments`, { body: "Started" });
    await post(alice, "/api/v1/work-logs", { workDate: "2026-09-06", hours: 1, taskType: "DESIGN", title: "Draft", taskId: id });
    await put(manager, `/api/v1/tasks/${id}`, { title: "History check", assigneeId: bobId, taskType: "DESIGN", priority: "HIGH", dueDate: "2026-12-01", status: "IN_PROGRESS" });
    // Saving without changes adds nothing.
    await put(manager, `/api/v1/tasks/${id}`, { title: "History check", assigneeId: bobId, taskType: "DESIGN", priority: "HIGH", dueDate: "2026-12-01", status: "IN_PROGRESS" });

    const history = (await manager.agent.get(`/api/v1/tasks/${id}`)).body.data.history;
    expect(history.map((h: { action: string }) => h.action)).toEqual(["CREATE", "UPDATE", "STATUS_CHANGE", "COMMENT", "TIME_LOGGED", "REASSIGN"]);
    expect(history[1].changes.fields).toEqual(
      expect.arrayContaining([
        { field: "Priority", from: "Medium", to: "High" },
        { field: "Due date", from: "—", to: "2026-12-01" },
      ]),
    );
    expect(history[2].changes.fields[0]).toEqual({ field: "Status", from: "To do", to: "In progress" });
    expect(history[2].user.name).toBe("EMPLOYEE");
    expect(history[5].changes.fields).toContainEqual({ field: "Assigned to", from: "Alice", to: "Bob" });
  });

  it("records completion time and lets managers reassign", async () => {
    const done = await post(alice, `/api/v1/tasks/${taskId}/status`, { status: "DONE" });
    expect(done.body.data.completedAt).not.toBeNull();
    expect(done.body.data.overdue).toBe(false);
    const reassigned = await put(manager, `/api/v1/tasks/${taskId}`, { title: "Design 3 Diwali posts", assigneeId: bobId, taskType: "DESIGN", priority: "HIGH", status: "IN_REVIEW" });
    expect(reassigned.status).toBe(200);
    expect(reassigned.body.data.assignee.id).toBe(bobId);
    expect(reassigned.body.data.completedAt).toBeNull();
  });
});
