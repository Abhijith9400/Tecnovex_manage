import { beforeAll, describe, expect, it } from "vitest";
import { expandOccurrences } from "../src/utils/recurrence";
import { createUser, login, post, resetDatabase, type Session } from "./helpers";

const d = (iso: string) => new Date(iso);

describe("recurrence expansion", () => {
  const base = { excludedDates: [] as string[], recurrenceUntil: null, recurrenceInterval: 1 };

  it("repeats weekly inside the window, keeping the duration", () => {
    const occ = expandOccurrences({ ...base, recurrence: "WEEKLY", startAt: d("2026-10-05T04:30:00Z"), endAt: d("2026-10-05T05:30:00Z") }, d("2026-10-01T00:00:00Z"), d("2026-11-01T00:00:00Z"));
    expect(occ.map((o) => o.dateKey)).toEqual(["2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26"]);
    expect(occ[2].end.getTime() - occ[2].start.getTime()).toBe(3_600_000);
  });

  it("skips months without the day and honours until + exclusions", () => {
    const occ = expandOccurrences(
      { ...base, recurrence: "MONTHLY", startAt: d("2026-01-31T00:00:00Z"), endAt: d("2026-01-31T00:00:00Z"), recurrenceUntil: d("2026-07-31T00:00:00Z"), excludedDates: ["2026-05-31"] },
      d("2026-01-01T00:00:00Z"),
      d("2027-01-01T00:00:00Z"),
    );
    expect(occ.map((o) => o.dateKey)).toEqual(["2026-01-31", "2026-03-31", "2026-07-31"]);
  });

  it("returns a single occurrence for non-repeating events only when in range", () => {
    const event = { ...base, recurrence: "NONE" as const, startAt: d("2026-10-10T00:00:00Z"), endAt: d("2026-10-10T00:00:00Z") };
    expect(expandOccurrences(event, d("2026-10-01T00:00:00Z"), d("2026-10-31T00:00:00Z"))).toHaveLength(1);
    expect(expandOccurrences(event, d("2026-11-01T00:00:00Z"), d("2026-11-30T00:00:00Z"))).toHaveLength(0);
  });
});

describe("calendar API", () => {
  let admin: Session;
  let alice: Session;
  let bob: Session;
  let accountant: Session;
  let aliceId: string;
  let clientId: string;
  const range = { from: "2026-10-01T00:00:00.000Z", to: "2026-11-01T00:00:00.000Z" };

  beforeAll(async () => {
    await resetDatabase();
    await createUser("ADMIN", "admin@test.local");
    await createUser("ACCOUNTANT", "accountant@test.local");
    admin = await login("admin@test.local");
    accountant = await login("accountant@test.local");
    clientId = (await post(admin, "/api/v1/clients", { name: "Cal Client", billingType: "RETAINER", billingCycle: "MONTHLY", paymentTermsDays: 15, status: "ACTIVE", country: "India" })).body.data.id;
    aliceId = (await post(admin, "/api/v1/employees", { fullName: "Alice", joiningDate: "2025-01-01", status: "ACTIVE" })).body.data.id;
    const bobId = (await post(admin, "/api/v1/employees", { fullName: "Bob", joiningDate: "2025-01-01", status: "ACTIVE" })).body.data.id;
    await createUser("EMPLOYEE", "alice@test.local", aliceId);
    await createUser("EMPLOYEE", "bob@test.local", bobId);
    alice = await login("alice@test.local");
    bob = await login("bob@test.local");
  });

  it("creates all-day and timed events and returns them for a client", async () => {
    const deadline = await post(admin, "/api/v1/calendar/events", { title: "Diwali poster design deadline", eventType: "DESIGN_DEADLINE", clientId, allDay: true, start: "2026-10-15", end: "2026-10-15" });
    expect(deadline.status).toBe(201);
    const meeting = await post(alice, "/api/v1/calendar/events", {
      title: "Weekly review",
      eventType: "MEETING",
      clientId,
      allDay: false,
      start: "2026-10-05T04:30:00.000Z",
      end: "2026-10-05T05:30:00.000Z",
      recurrence: "WEEKLY",
      attendeeIds: [aliceId],
    });
    expect(meeting.status).toBe(201);

    const res = await accountant.agent.get("/api/v1/calendar").query({ ...range, clientId });
    expect(res.status).toBe(200);
    const titles = res.body.data.map((i: { title: string }) => i.title);
    expect(titles.filter((t: string) => t === "Weekly review")).toHaveLength(4);
    expect(titles).toContain("Diwali poster design deadline");
  });

  it("lets employees edit any event, but their deletes only become requests", async () => {
    const items = (await admin.agent.get("/api/v1/calendar").query(range)).body.data;
    const deadline = items.find((i: { title: string }) => i.title.startsWith("Diwali"));
    const review = items.find((i: { title: string }) => i.title === "Weekly review");
    expect(deadline.canEdit).toBe(true);
    const asAlice = (await alice.agent.get("/api/v1/calendar").query(range)).body.data;
    expect(asAlice.find((i: { refId: string }) => i.refId === deadline.refId).canEdit).toBe(true);
    const asked = await bob.agent.delete(`/api/v1/calendar/events/${review.refId}`).set("X-CSRF-Token", bob.csrf);
    expect(asked.status).toBe(202);
    expect(asked.body.data.approvalRequested).toBe(true);
    expect((await admin.agent.get(`/api/v1/calendar/events/${review.refId}`)).status).toBe(200);
    // Bob withdraws it again so later tests see the full series.
    expect((await post(bob, `/api/v1/approvals/${asked.body.data.request.id}/cancel`, {})).status).toBe(200);
  });

  it("moves single events by drag but not repeating ones", async () => {
    const items = (await admin.agent.get("/api/v1/calendar").query(range)).body.data;
    const deadline = items.find((i: { title: string }) => i.title.startsWith("Diwali"));
    const review = items.find((i: { title: string }) => i.title === "Weekly review");
    const moved = await admin.agent.patch(`/api/v1/calendar/events/${deadline.refId}/move`).set("X-CSRF-Token", admin.csrf).send({ start: "2026-10-16", end: "2026-10-16", allDay: true });
    expect(moved.status).toBe(200);
    expect(moved.body.data.startAt.slice(0, 10)).toBe("2026-10-16");
    const blocked = await alice.agent.patch(`/api/v1/calendar/events/${review.refId}/move`).set("X-CSRF-Token", alice.csrf).send({ start: "2026-10-06T04:30:00.000Z", end: "2026-10-06T05:30:00.000Z", allDay: false });
    expect(blocked.status).toBe(400);
  });

  it("deletes one occurrence of a repeating event", async () => {
    const review = (await alice.agent.get("/api/v1/calendar").query(range)).body.data.find((i: { title: string }) => i.title === "Weekly review");
    const res = await alice.agent.delete(`/api/v1/calendar/events/${review.refId}`).query({ occurrence: "2026-10-12" }).set("X-CSRF-Token", alice.csrf);
    expect(res.status).toBe(202);
    expect(res.body.data.request.title).toBe('Delete the 2026-10-12 occurrence of "Weekly review"');
    // An admin approves it, which removes just that one date.
    expect((await post(admin, `/api/v1/approvals/${res.body.data.request.id}/approve`, {})).status).toBe(200);
    const after = (await alice.agent.get("/api/v1/calendar").query(range)).body.data.filter((i: { title: string }) => i.title === "Weekly review");
    expect(after.map((i: { occurrenceDate: string }) => i.occurrenceDate)).toEqual(["2026-10-05", "2026-10-19", "2026-10-26"]);
  });

  it("shows task due dates only to the assignee and managers", async () => {
    await post(admin, "/api/v1/tasks", { title: "Reel edit", assigneeId: aliceId, taskType: "VIDEO_EDITING", priority: "HIGH", dueDate: "2026-10-20" });
    const has = async (s: Session) => (await s.agent.get("/api/v1/calendar").query(range)).body.data.some((i: { source: string }) => i.source === "TASK");
    expect(await has(admin)).toBe(true);
    expect(await has(alice)).toBe(true);
    expect(await has(bob)).toBe(false);
    expect(await has(accountant)).toBe(false);
  });
});
