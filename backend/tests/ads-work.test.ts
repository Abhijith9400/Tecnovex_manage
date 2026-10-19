import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/db/prisma";
import { adMetrics } from "../src/services/adCampaign.service";
import { createUser, login, post, put, resetDatabase, type Session } from "./helpers";

describe("ad campaigns, work log and report categories", () => {
  let admin: Session;
  let manager: Session;
  let accountant: Session;
  let employee: Session;
  let clientId: string;
  let employeeId: string;
  let otherEmployeeId: string;

  beforeAll(async () => {
    await resetDatabase();
    await createUser("ADMIN", "admin@test.local");
    await createUser("MANAGER", "manager@test.local");
    await createUser("ACCOUNTANT", "accountant@test.local");
    admin = await login("admin@test.local");
    manager = await login("manager@test.local");
    accountant = await login("accountant@test.local");

    clientId = (await post(admin, "/api/v1/clients", { name: "Ads Client", billingType: "RETAINER", billingCycle: "MONTHLY", paymentTermsDays: 15, status: "ACTIVE", country: "India" })).body.data.id;
    employeeId = (await post(admin, "/api/v1/employees", { fullName: "Dev Designer", joiningDate: "2025-01-01", status: "ACTIVE" })).body.data.id;
    otherEmployeeId = (await post(admin, "/api/v1/employees", { fullName: "Other Person", joiningDate: "2025-01-01", status: "ACTIVE" })).body.data.id;
    await createUser("EMPLOYEE", "dev@test.local", employeeId);
    employee = await login("dev@test.local");
  });

  it("computes ad metrics on the server", () => {
    expect(adMetrics({ spend: "1000", budget: "2000", impressions: 50000, clicks: 500, results: 40 })).toEqual({
      ctr: "1.00",
      cpc: "2.00",
      cpm: "20.00",
      costPerResult: "25.00",
      budgetUsed: "50.0",
    });
    expect(adMetrics({ spend: "0", impressions: 0, clicks: 0, results: 0 }).ctr).toBeNull();
  });

  it("records campaigns and totals them per client in reports", async () => {
    const base = { clientId, platform: "META", status: "COMPLETED", paidFrom: "CLIENT_ACCOUNT", startDate: "2026-09-01", endDate: "2026-09-10" };
    const reel = await post(manager, "/api/v1/ad-campaigns", { ...base, postUrl: "https://www.instagram.com/reel/example/", name: "Reel boost", campaignType: "REEL_BOOST", spend: "1500.50", impressions: 40000, reach: 30000, clicks: 400, results: 400, resultLabel: "Link clicks" });
    expect(reel.status).toBe(201);
    expect(reel.body.data.metrics.ctr).toBe("1.00");
    await post(manager, "/api/v1/ad-campaigns", { ...base, name: "Lead ads", campaignType: "LEAD_GENERATION", spend: "3000", paidFrom: "AGENCY_PAID", impressions: 60000, reach: 45000, clicks: 900, results: 60, resultLabel: "Leads" });
    const invalid = await post(manager, "/api/v1/ad-campaigns", { ...base, name: "Bad", campaignType: "POST_BOOST", impressions: 10, clicks: 50 });
    expect(invalid.status).toBe(400);

    const report = await admin.agent.get("/api/v1/reports/ads-by-client").query({ from: "2026-09-01", to: "2026-09-30" });
    expect(report.status).toBe(200);
    const row = report.body.data.rows[0];
    expect(row.spend).toBe("4500.50");
    expect(row.clientPaid).toBe("1500.50");
    expect(row.agencyPaid).toBe("3000.00");
    expect(row.impressions).toBe(100000);
    expect(row.campaigns).toBe(2);

    // A campaign that ended before the period is excluded.
    const later = await admin.agent.get("/api/v1/reports/ads-campaigns").query({ from: "2026-10-01", to: "2026-10-31" });
    expect(later.body.data.rows).toHaveLength(0);
  });

  it("lets employees record and update campaigns but not delete them", async () => {
    const created = await post(employee, "/api/v1/ad-campaigns", {
      clientId,
      name: "Employee post boost",
      postUrl: "https://www.instagram.com/p/example123/",
      platform: "META",
      campaignType: "POST_BOOST",
      status: "ACTIVE",
      paidFrom: "CLIENT_ACCOUNT",
      startDate: "2026-09-15",
      spend: "500",
    });
    expect(created.status).toBe(201);
    const id = created.body.data.id;
    const updated = await put(employee, `/api/v1/ad-campaigns/${id}`, {
      clientId,
      name: "Employee post boost",
      postUrl: "https://www.instagram.com/p/example123/",
      platform: "META",
      campaignType: "POST_BOOST",
      status: "COMPLETED",
      paidFrom: "CLIENT_ACCOUNT",
      startDate: "2026-09-15",
      endDate: "2026-09-20",
      spend: "750",
      impressions: 12000,
      clicks: 150,
    });
    expect(updated.status).toBe(200);
    expect(updated.body.data.spend).toBe("750");
    expect((await employee.agent.delete(`/api/v1/ad-campaigns/${id}`).set("X-CSRF-Token", employee.csrf)).status).toBe(202);
    expect((await accountant.agent.post("/api/v1/ad-campaigns").set("X-CSRF-Token", accountant.csrf).send({})).status).toBe(403);
    expect((await manager.agent.delete(`/api/v1/ad-campaigns/${id}`).set("X-CSRF-Token", manager.csrf)).status).toBe(200);
  });

  it("requires the boosted creative or post link and reports boosts per creative", async () => {
    const base = { clientId, platform: "META", status: "COMPLETED", paidFrom: "CLIENT_ACCOUNT", startDate: "2026-08-01", endDate: "2026-08-05", campaignType: "REEL_BOOST" };
    const missing = await post(employee, "/api/v1/ad-campaigns", { ...base, name: "Unknown boost", spend: "100" });
    expect(missing.status).toBe(400);

    const reel = await prisma.creativeAsset.create({ data: { clientId, title: "Diwali reel", contentType: "REEL", status: "PUBLISHED" } });
    await post(employee, "/api/v1/ad-campaigns", { ...base, name: "Reel boost 1", creativeId: reel.id, spend: "400", impressions: 10000, clicks: 100, results: 100 });
    await post(employee, "/api/v1/ad-campaigns", { ...base, name: "Reel boost 2", creativeId: reel.id, spend: "600.25", impressions: 15000, clicks: 200, results: 150, startDate: "2026-08-10", endDate: "2026-08-12" });

    const report = await admin.agent.get("/api/v1/reports/ads-boosted-creatives").query({ from: "2026-08-01", to: "2026-08-31" });
    expect(report.status).toBe(200);
    const row = report.body.data.rows.find((r: { creative: string }) => r.creative === "Diwali reel");
    expect(row).toMatchObject({ contentType: "REEL", boosts: 2, spend: "1000.25", impressions: 25000, results: 250 });

    const creative = await admin.agent.get(`/api/v1/clients/${clientId}/creatives/${reel.id}`);
    expect(creative.body.data.boostSummary).toMatchObject({ count: 2, spend: "1000.25" });
  });

  it("lets employees log only their own time", async () => {
    const own = await post(employee, "/api/v1/work-logs", { employeeId: otherEmployeeId, clientId, workDate: "2026-09-02", hours: 2.5, taskType: "DESIGN", title: "Reel cover designs" });
    expect(own.status).toBe(201);
    expect(own.body.data.employeeId).toBe(employeeId); // the requested employeeId is ignored for employees
    expect(own.body.data.minutes).toBe(150);

    const otherLog = await post(manager, "/api/v1/work-logs", { employeeId: otherEmployeeId, workDate: "2026-09-02", hours: 3, taskType: "CLIENT_MEETING", title: "Planning call" });
    expect(otherLog.status).toBe(201);

    const mine = await employee.agent.get("/api/v1/work-logs");
    expect(mine.body.data.every((l: { employeeId: string }) => l.employeeId === employeeId)).toBe(true);
    expect((await put(employee, `/api/v1/work-logs/${otherLog.body.data.id}`, { workDate: "2026-09-02", hours: 1, taskType: "OTHER", title: "x" })).status).toBe(404);
    expect((await accountant.agent.get("/api/v1/work-logs")).status).toBe(403);
  });

  it("rejects more than 24 hours for one person on one day", async () => {
    await post(manager, "/api/v1/work-logs", { employeeId, workDate: "2026-09-03", hours: 20, taskType: "VIDEO_EDITING", title: "Long edit" });
    const over = await post(manager, "/api/v1/work-logs", { employeeId, workDate: "2026-09-03", hours: 5, taskType: "VIDEO_EDITING", title: "Too much" });
    expect(over.status).toBe(400);
  });

  it("summarises hours by employee", async () => {
    const res = await manager.agent.get("/api/v1/reports/work-by-employee").query({ from: "2026-09-01", to: "2026-09-30" });
    expect(res.status).toBe(200);
    const dev = res.body.data.rows.find((r: { label: string }) => r.label.startsWith("Dev Designer"));
    expect(dev.hours).toBe("22.50");
    expect(dev.days).toBe(2);
    expect(res.body.data.totals.hours).toBe("25.50");
  });

  it("restricts report categories by role", async () => {
    const range = { from: "2026-09-01", to: "2026-09-30" };
    expect((await manager.agent.get("/api/v1/reports/monthly-summary").query(range)).status).toBe(200);
    expect((await manager.agent.get("/api/v1/reports/ads-campaigns").query(range)).status).toBe(200);
    expect((await manager.agent.get("/api/v1/reports/audit-log").query(range)).status).toBe(200);
    expect((await accountant.agent.get("/api/v1/reports/work-log").query(range)).status).toBe(403);
    expect((await accountant.agent.get("/api/v1/reports/ads-by-type").query(range)).status).toBe(200);
    expect((await employee.agent.get("/api/v1/reports/work-log").query(range)).status).toBe(403);

    const audit = await admin.agent.get("/api/v1/reports/audit-log").query({ ...range, from: "2020-01-01", to: "2099-12-31", entityType: "AdCampaign" });
    expect(audit.status).toBe(200);
    expect(audit.body.data.rows.length).toBe(await prisma.auditLog.count({ where: { entityType: "AdCampaign" } }));
  });
});
