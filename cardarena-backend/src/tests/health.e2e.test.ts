import request from "supertest";
import { app } from "../app";



describe("Health Endpoint (E2E)", () => {
  it("should return 200 OK", async () => {
    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("ready");
    expect(response.body).toHaveProperty("realtime.matchmaking.mode");
  });

  it("should expose readiness route", async () => {
    const response = await request(app).get("/health/ready");
    expect([200, 503]).toContain(response.status);
    expect(response.body).toHaveProperty("ready");
  });
});
