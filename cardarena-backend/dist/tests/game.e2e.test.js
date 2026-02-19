"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bcrypt_1 = __importDefault(require("bcrypt"));
const supertest_1 = __importDefault(require("supertest"));
const app_1 = require("../app");
const db_1 = require("../db");
function makeState() {
    return {
        dealerSeat: 1,
        currentTurnSeat: 2,
        hands: {
            "1": [{ suit: "SPADES", rank: 14 }],
            "2": [{ suit: "HEARTS", rank: 2 }],
            "3": [{ suit: "CLUBS", rank: 3 }],
            "4": [{ suit: "DIAMONDS", rank: 4 }],
        },
        bids: {},
        trick: [],
        completedTricks: 0,
        handNumber: 1,
        teamATricks: 0,
        teamBTricks: 0,
        teamAScore: 0,
        teamBScore: 0,
        teamASets: 0,
        teamBSets: 0,
        spadesBroken: false,
    };
}
describe("Game security & recovery e2e", () => {
    const runId = Date.now();
    const userA = {
        email: `seat1_${runId}@example.com`,
        username: `seat1_${runId}`,
        password: "Password123!",
    };
    const userB = {
        email: `seat2_${runId}@example.com`,
        username: `seat2_${runId}`,
        password: "Password123!",
    };
    let gameId = "";
    let tokenA = "";
    let tokenB = "";
    beforeAll(async () => {
        const [hashA, hashB] = await Promise.all([
            bcrypt_1.default.hash(userA.password, 10),
            bcrypt_1.default.hash(userB.password, 10),
        ]);
        const [a, b] = await Promise.all([
            db_1.prisma.user.create({
                data: {
                    email: userA.email,
                    username: userA.username,
                    password: hashA,
                    signupStatus: "APPROVED",
                    termsAcceptedAt: new Date(),
                    privacyAcceptedAt: new Date(),
                    dateOfBirth: new Date("2000-01-01"),
                    countryCode: "US",
                    region: "Georgia",
                    wallet: { create: {} },
                },
            }),
            db_1.prisma.user.create({
                data: {
                    email: userB.email,
                    username: userB.username,
                    password: hashB,
                    signupStatus: "APPROVED",
                    termsAcceptedAt: new Date(),
                    privacyAcceptedAt: new Date(),
                    dateOfBirth: new Date("2000-01-01"),
                    countryCode: "US",
                    region: "Georgia",
                    wallet: { create: {} },
                },
            }),
        ]);
        const tournament = await db_1.prisma.tournament.create({
            data: {
                entryFee: 0,
                maxPlayers: 4,
                status: "FULL",
            },
        });
        const game = await db_1.prisma.game.create({
            data: {
                tournamentId: tournament.id,
                status: "ACTIVE",
                phase: "PLAYING",
                dealerSeat: 1,
                currentTurnSeat: 2,
                state: makeState(),
                players: {
                    create: [
                        { userId: a.id, seat: 1, team: "TEAM_A", isBot: false },
                        { userId: b.id, seat: 2, team: "TEAM_B", isBot: false },
                        { seat: 3, team: "TEAM_A", isBot: true },
                        { seat: 4, team: "TEAM_B", isBot: true },
                    ],
                },
            },
        });
        gameId = game.id;
        const [loginA, loginB] = await Promise.all([
            (0, supertest_1.default)(app_1.app).post("/api/v1/auth/login").send({ email: userA.email, password: userA.password }),
            (0, supertest_1.default)(app_1.app).post("/api/v1/auth/login").send({ email: userB.email, password: userB.password }),
        ]);
        tokenA = loginA.body.token;
        tokenB = loginB.body.token;
    });
    it("returns seat-redacted state per user", async () => {
        const [resA, resB] = await Promise.all([
            (0, supertest_1.default)(app_1.app).get(`/api/v1/games/${gameId}`).set("Authorization", `Bearer ${tokenA}`),
            (0, supertest_1.default)(app_1.app).get(`/api/v1/games/${gameId}`).set("Authorization", `Bearer ${tokenB}`),
        ]);
        expect(resA.status).toBe(200);
        expect(resB.status).toBe(200);
        expect(Array.isArray(resA.body.data.state.hands["1"])).toBe(true);
        expect(Array.isArray(resA.body.data.state.hands["2"])).toBe(false);
        expect(resA.body.data.state.hands["2"].count).toBeGreaterThanOrEqual(0);
        expect(Array.isArray(resB.body.data.state.hands["2"])).toBe(true);
        expect(Array.isArray(resB.body.data.state.hands["1"])).toBe(false);
        expect(resB.body.data.state.hands["1"].count).toBeGreaterThanOrEqual(0);
    });
    it("exposes active game recovery route", async () => {
        const res = await (0, supertest_1.default)(app_1.app)
            .get("/api/v1/games/me/active")
            .set("Authorization", `Bearer ${tokenA}`);
        expect(res.status).toBe(200);
        expect(res.body.data?.id).toBe(gameId);
    });
});
