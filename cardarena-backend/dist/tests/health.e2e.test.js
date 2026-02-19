"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const app_1 = require("../app");
describe("Health Endpoint (E2E)", () => {
    it("should return 200 OK", async () => {
        const response = await (0, supertest_1.default)(app_1.app).get("/health");
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty("ready");
        expect(response.body).toHaveProperty("realtime.matchmaking.mode");
    });
    it("should expose readiness route", async () => {
        const response = await (0, supertest_1.default)(app_1.app).get("/health/ready");
        expect([200, 503]).toContain(response.status);
        expect(response.body).toHaveProperty("ready");
    });
});
