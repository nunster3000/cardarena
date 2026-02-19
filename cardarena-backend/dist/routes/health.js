"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../db");
const matchmaking_1 = require("../game/matchmaking");
const party_1 = require("./party");
const runtime_1 = require("../config/runtime");
const router = (0, express_1.Router)();
router.get("/", async (_req, res) => {
    let database = "up";
    try {
        await db_1.prisma.$queryRaw `SELECT 1`;
    }
    catch {
        database = "down";
    }
    const runtime = (0, runtime_1.validateRuntimeConfig)({ logWarnings: false });
    const ready = database === "up";
    const payload = {
        status: ready ? "ok" : "degraded",
        service: "cardarena-backend",
        timestamp: new Date().toISOString(),
        ready,
        checks: {
            database,
        },
        runtime,
        realtime: {
            matchmaking: (0, matchmaking_1.getMatchmakingHealth)(),
            party: (0, party_1.getPartyHealth)(),
        },
    };
    res.status(200).json(payload);
});
router.get("/ready", async (_req, res) => {
    try {
        await db_1.prisma.$queryRaw `SELECT 1`;
        res.status(200).json({ ready: true });
    }
    catch {
        res.status(503).json({ ready: false });
    }
});
exports.default = router;
