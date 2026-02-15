import request from "supertest";
import { app } from "../app";



describe("Health Endpoint (E2E)", () => {
  it("should return 200 OK", async () => {
    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
  });
});
