"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const db_1 = require("../db");
const auth_1 = require("../middleware/auth");
const errorHandler_1 = require("../middleware/errorHandler");
const engine_1 = require("../game/engine");
const bid_1 = require("../game/bid");
const play_1 = require("../game/play");
const stateView_1 = require("../game/stateView");
const metrics_1 = require("../monitoring/metrics");
const matchmaking_1 = require("../game/matchmaking");
const router = (0, express_1.Router)();
router.use(auth_1.authMiddleware);
async function getPlayerSeat(gameId, userId) {
    const player = await db_1.prisma.gamePlayer.findFirst({
        where: { gameId, userId },
        select: { id: true, seat: true },
    });
    if (!player)
        throw new errorHandler_1.AppError("Not a player in this game", 403);
    return player.seat;
}
router.get("/me/active", async (req, res, next) => {
    try {
        (0, metrics_1.incMetric)("games.me_active.requests.total");
        const gp = await db_1.prisma.gamePlayer.findFirst({
            where: {
                userId: req.userId,
                game: {
                    status: { in: [client_1.GameStatus.WAITING, client_1.GameStatus.ACTIVE] },
                },
            },
            include: {
                game: {
                    select: {
                        id: true,
                        status: true,
                        phase: true,
                        tournamentId: true,
                        createdAt: true,
                    },
                },
            },
            orderBy: { createdAt: "desc" },
        });
        if (!gp?.game) {
            return res.json({ data: null });
        }
        res.json({ data: gp.game });
    }
    catch (err) {
        next(err);
    }
});
router.post("/queue/free", async (req, res, next) => {
    try {
        await (0, matchmaking_1.joinQueue)(req.userId, 0, async () => undefined, {
            ip: req.ip || null,
            userAgent: req.headers["user-agent"] || null,
            device: req.headers["sec-ch-ua-platform"] ||
                req.headers["user-agent"] ||
                null,
        });
        res.json({ success: true });
    }
    catch (err) {
        next(err);
    }
});
router.post("/queue/free/cancel", async (req, res, next) => {
    try {
        (0, matchmaking_1.leaveQueue)(req.userId, 0);
        res.json({ success: true });
    }
    catch (err) {
        next(err);
    }
});
router.post("/queue/free/fill-bots", async (req, res, next) => {
    try {
        const gameId = await (0, matchmaking_1.forceFillWithBots)(req.userId, 0);
        res.json({ success: true, gameId });
    }
    catch (err) {
        next(err);
    }
});
router.post("/queue/free/bots", async (req, res, next) => {
    try {
        const gameId = await (0, matchmaking_1.createFreeBotsGame)(req.userId, {
            ip: req.ip || null,
            userAgent: req.headers["user-agent"] || null,
            device: req.headers["sec-ch-ua-platform"] ||
                req.headers["user-agent"] ||
                null,
        });
        res.json({ success: true, gameId });
    }
    catch (err) {
        next(err);
    }
});
router.get("/:gameId", async (req, res, next) => {
    try {
        (0, metrics_1.incMetric)("games.fetch.requests.total");
        const { gameId } = req.params;
        const playerSeat = await getPlayerSeat(gameId, req.userId);
        const game = await db_1.prisma.game.findUnique({
            where: { id: gameId },
            include: {
                players: {
                    select: {
                        seat: true,
                        isBot: true,
                        user: { select: { id: true, username: true } },
                    },
                    orderBy: { seat: "asc" },
                },
            },
        });
        if (!game)
            throw new errorHandler_1.AppError("Game not found", 404);
        res.json({
            data: {
                id: game.id,
                status: game.status,
                phase: game.phase,
                tournamentId: game.tournamentId,
                state: (0, stateView_1.serializeGameStateForSeat)(game.state, playerSeat),
                playerSeat,
                players: game.players,
            },
        });
    }
    catch (err) {
        next(err);
    }
});
router.post("/:gameId/start", async (req, res, next) => {
    try {
        (0, metrics_1.incMetric)("games.start.requests.total");
        const { gameId } = req.params;
        const seat = await getPlayerSeat(gameId, req.userId);
        const existing = await db_1.prisma.game.findUnique({
            where: { id: gameId },
            select: { id: true, phase: true, status: true },
        });
        if (!existing)
            throw new errorHandler_1.AppError("Game not found", 404);
        if (existing.status === client_1.GameStatus.ACTIVE &&
            existing.phase !== client_1.GamePhase.WAITING) {
            return res.json({ success: true, alreadyStarted: true });
        }
        const state = await (0, engine_1.startGame)(gameId);
        res.json({ success: true, state: (0, stateView_1.serializeGameStateForSeat)(state, seat) });
    }
    catch (err) {
        next(err);
    }
});
router.post("/:gameId/bid", async (req, res, next) => {
    try {
        (0, metrics_1.incMetric)("games.bid.requests.total");
        const { gameId } = req.params;
        const bid = Number(req.body.bid);
        if (Number.isNaN(bid))
            throw new errorHandler_1.AppError("bid must be a number", 400);
        const seat = await getPlayerSeat(gameId, req.userId);
        const state = await (0, bid_1.submitBid)(gameId, seat, bid);
        res.json({ success: true, state: (0, stateView_1.serializeGameStateForSeat)(state, seat) });
    }
    catch (err) {
        next(err);
    }
});
router.post("/:gameId/play", async (req, res, next) => {
    try {
        (0, metrics_1.incMetric)("games.play.requests.total");
        const { gameId } = req.params;
        const suit = String(req.body.suit || "").toUpperCase();
        const rank = Number(req.body.rank);
        if (!suit || Number.isNaN(rank)) {
            throw new errorHandler_1.AppError("suit and rank are required", 400);
        }
        const seat = await getPlayerSeat(gameId, req.userId);
        const state = await (0, play_1.playCard)(gameId, seat, { suit, rank: String(rank) });
        res.json({ success: true, state: (0, stateView_1.serializeGameStateForSeat)(state, seat) });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
