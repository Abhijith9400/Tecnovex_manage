import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";

describe("health and error handling", () => {
  const app = createApp();

  it("returns ok from /api/v1/health", async () => {
    const res = await request(app).get("/api/v1/health");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe("ok");
  });

  it("returns a consistent 404 shape for unknown routes", async () => {
    const res = await request(app).get("/api/v1/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ success: false, error: { code: "NOT_FOUND" } });
  });
});
