"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerGameSockets = registerGameSockets;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const db_1 = require("../db");
const bot_1 = require("../game/bot");
const engine_1 = require("../game/engine");
const matchmaking_1 = require("../game/matchmaking");
const stateView_1 = require("../game/stateView");
const metrics_1 = require("../monitoring/metrics");
const activeConnections = new Map();
const disconnectTimers = new Map();
const userConnectionCounts = new Map();
const socketRateLimit = new Map();
const MAX_EVENTS_PER_SECOND = 10;
function getJwtSecret() {
    const secret = process.env.JWT_SECRET;
    if (secret)
        return secret;
    if (process.env.NODE_ENV === "test") {
        return "test_secret";
    }
    throw new Error("JWT_SECRET is not defined");
}
function registerGameSockets(io) {
    const jwtSecret = getJwtSecret();
    io.use((socket, next) => {
        try {
            const token = socket.handshake.auth?.token;
            if (!token) {
                return next(new Error("Missing socket auth token"));
            }
            const payload = jsonwebtoken_1.default.verify(token, jwtSecret);
            socket.data.userId = payload.userId;
            socket.data.userRole = payload.role;
            next();
        }
        catch {
            next(new Error("Invalid socket auth token"));
        }
    });
    function checkRateLimit(socketId) {
        const now = Date.now();
        const data = socketRateLimit.get(socketId);
        if (!data) {
            socketRateLimit.set(socketId, { count: 1, timestamp: now });
            return true;
        }
        if (now - data.timestamp > 1000) {
            socketRateLimit.set(socketId, { count: 1, timestamp: now });
            return true;
        }
        if (data.count >= MAX_EVENTS_PER_SECOND) {
            return false;
        }
        data.count++;
        return true;
    }
    io.on("connection", (rawSocket) => {
        const socket = rawSocket;
        const userId = socket.data.userId;
        if (!userId) {
            socket.disconnect(true);
            return;
        }
        console.log("Player connected:", socket.id);
        (0, metrics_1.incMetric)("socket.connections.total");
        socket.join(`user:${userId}`);
        const currentCount = userConnectionCounts.get(userId) ?? 0;
        userConnectionCounts.set(userId, currentCount + 1);
        db_1.prisma.user
            .update({
            where: { id: userId },
            data: { isOnline: true, lastSeenAt: new Date() },
        })
            .catch(() => undefined);
        socket.on("find_table", async ({ entryFee }) => {
            if (!checkRateLimit(socket.id)) {
                (0, metrics_1.incMetric)("socket.ratelimit.hit.total");
                return socket.emit("error", { message: "Rate limit exceeded" });
            }
            try {
                await (0, matchmaking_1.joinQueue)(userId, entryFee, async ({ gameId }) => {
                    io.to(`user:${userId}`).emit("match_found", { gameId });
                }, {
                    ip: socket.handshake.address || null,
                    userAgent: socket.handshake.headers["user-agent"] || null,
                    device: socket.handshake.headers["sec-ch-ua-platform"] ||
                        socket.handshake.headers["user-agent"] ||
                        null,
                });
            }
            catch (err) {
                (0, metrics_1.incMetric)("socket.errors.find_table.total");
                socket.emit("error", { message: err?.message ?? "Unable to join queue" });
            }
        });
        socket.on("cancel_find_table", ({ entryFee }) => {
            const fee = Number(entryFee);
            if (Number.isFinite(fee)) {
                (0, matchmaking_1.leaveQueue)(userId, fee);
            }
            else {
                (0, matchmaking_1.leaveQueue)(userId);
            }
        });
        socket.on("place_bid", async ({ gameId, bid }) => {
            if (!checkRateLimit(socket.id)) {
                (0, metrics_1.incMetric)("socket.ratelimit.hit.total");
                return socket.emit("error", { message: "Rate limit exceeded" });
            }
            try {
                const gp = await db_1.prisma.gamePlayer.findFirst({ where: { gameId, userId } });
                if (!gp)
                    return socket.emit("error", { message: "Not a player in this game" });
                const { placeBid } = await Promise.resolve().then(() => __importStar(require("../game/bid")));
                await placeBid(gameId, gp.seat, bid);
            }
            catch (err) {
                (0, metrics_1.incMetric)("socket.errors.place_bid.total");
                if (err?.message === "Game action already in progress") {
                    socket.emit("error", { message: "Action already in progress. Please retry." });
                    return;
                }
                socket.emit("error", { message: err?.message ?? "Unable to place bid" });
            }
        });
        socket.on("play_card", async ({ gameId, card }) => {
            if (!checkRateLimit(socket.id)) {
                (0, metrics_1.incMetric)("socket.ratelimit.hit.total");
                return socket.emit("error", { message: "Rate limit exceeded" });
            }
            try {
                const gp = await db_1.prisma.gamePlayer.findFirst({ where: { gameId, userId } });
                if (!gp)
                    return socket.emit("error", { message: "Not a player in this game" });
                const { playCard } = await Promise.resolve().then(() => __importStar(require("../game/play")));
                await playCard(gameId, gp.seat, card);
            }
            catch (err) {
                (0, metrics_1.incMetric)("socket.errors.play_card.total");
                if (err?.message === "Game action already in progress") {
                    socket.emit("error", { message: "Action already in progress. Please retry." });
                    return;
                }
                socket.emit("error", { message: err?.message ?? "Unable to play card" });
            }
        });
        socket.on("join_game", async ({ gameId }) => {
            if (!checkRateLimit(socket.id)) {
                (0, metrics_1.incMetric)("socket.ratelimit.hit.total");
                return socket.emit("error", { message: "Rate limit exceeded" });
            }
            socket.join(gameId);
            const player = await db_1.prisma.gamePlayer.findFirst({
                where: {
                    gameId,
                    userId,
                },
            });
            if (!player) {
                (0, metrics_1.incMetric)("socket.errors.join_game.total");
                socket.emit("error", { message: "Player not found in game" });
                return;
            }
            activeConnections.set(socket.id, {
                gameId,
                seat: player.seat,
            });
            if (disconnectTimers.has(player.id)) {
                clearTimeout(disconnectTimers.get(player.id));
                disconnectTimers.delete(player.id);
            }
            await db_1.prisma.gamePlayer.update({
                where: { id: player.id },
                data: {
                    disconnectedAt: null,
                    replacedByBot: false,
                },
            });
            const game = await db_1.prisma.game.findUnique({
                where: { id: gameId },
                select: { state: true },
            });
            if (game?.state) {
                socket.emit("game_state", (0, stateView_1.serializeGameStateForSeat)(game.state, player.seat));
            }
            console.log(`User ${userId} joined game ${gameId}`);
        });
        socket.on("start_game", async ({ gameId }) => {
            if (!checkRateLimit(socket.id)) {
                (0, metrics_1.incMetric)("socket.ratelimit.hit.total");
                return socket.emit("error", { message: "Rate limit exceeded" });
            }
            try {
                await (0, engine_1.startGame)(gameId);
                io.to(gameId).emit("game_started", { gameId });
            }
            catch (err) {
                (0, metrics_1.incMetric)("socket.errors.start_game.total");
                console.error(err);
                socket.emit("error", { message: "Unable to start game" });
            }
        });
        socket.on("disconnect", async () => {
            (0, metrics_1.incMetric)("socket.disconnects.total");
            const count = userConnectionCounts.get(userId) ?? 0;
            const next = Math.max(0, count - 1);
            userConnectionCounts.set(userId, next);
            if (next === 0) {
                await db_1.prisma.user
                    .update({
                    where: { id: userId },
                    data: { isOnline: false, lastSeenAt: new Date() },
                })
                    .catch(() => undefined);
            }
            const connection = activeConnections.get(socket.id);
            if (!connection)
                return;
            const { gameId, seat } = connection;
            const player = await db_1.prisma.gamePlayer.findFirst({
                where: { gameId, seat },
            });
            if (!player)
                return;
            console.log(`Player seat ${seat} disconnected`);
            await db_1.prisma.gamePlayer.update({
                where: { id: player.id },
                data: {
                    disconnectedAt: new Date(),
                },
            });
            const timer = setTimeout(async () => {
                console.log(`Replacing seat ${seat} with bot`);
                await db_1.prisma.gamePlayer.update({
                    where: { id: player.id },
                    data: {
                        isBot: true,
                        replacedByBot: true,
                    },
                });
                await (0, bot_1.triggerBotMove)(gameId);
                disconnectTimers.delete(player.id);
            }, 30 * 1000);
            disconnectTimers.set(player.id, timer);
            activeConnections.delete(socket.id);
        });
    });
}
