import request from "supertest";
import { app } from "../app";
import { prisma } from "../db";

describe("Auth & Wallet Flow", () => {
  const runId = Date.now();
  const testUser = {
    email: `testuser_${runId}@example.com`,
    username: `testuser_${runId}`,
    password: "Password123!",
    dateOfBirth: "2000-01-01",
    countryCode: "US",
    region: "California",
  };

  it("should register a user and auto-create wallet", async () => {
    const response = await request(app)
      .post("/api/v1/auth/register")
      .send(testUser);

    expect(response.status).toBe(201);

    const userInDb = await prisma.user.findUnique({
      where: { email: testUser.email },
      include: { wallet: true },
    });

    expect(userInDb).not.toBeNull();
    expect(userInDb?.wallet).not.toBeNull();
    expect(userInDb?.wallet?.balance.toString()).toBe("0");
  });
});
