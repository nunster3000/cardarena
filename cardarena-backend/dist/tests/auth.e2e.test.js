"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const app_1 = require("../app");
const db_1 = require("../db");
describe("Auth & Wallet Flow", () => {
    const runId = Date.now();
    const testUser = {
        email: `testuser_${runId}@example.com`,
        username: `testuser_${runId}`,
        password: "Password123!",
        dateOfBirth: "2000-01-01",
        countryCode: "US",
        region: "California",
        acceptedTerms: true,
        acceptedPrivacy: true,
    };
    it("should register a user and auto-create wallet", async () => {
        const response = await (0, supertest_1.default)(app_1.app)
            .post("/api/v1/auth/register")
            .send(testUser);
        expect(response.status).toBe(201);
        const userInDb = await db_1.prisma.user.findUnique({
            where: { email: testUser.email },
            include: { wallet: true },
        });
        expect(userInDb).not.toBeNull();
        expect(userInDb?.wallet).not.toBeNull();
        expect(userInDb?.wallet?.balance.toString()).toBe("0");
    });
});
