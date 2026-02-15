import request from "supertest";
import { app } from "../app";
import { prisma } from "../db";

describe("Auth & Wallet Flow", () => {
  const testUser = {
    email: "testuser@example.com",
    username: "testuser",
    password: "Password123!",
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
