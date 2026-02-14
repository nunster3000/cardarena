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
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerGameSockets = registerGameSockets;
const engine_1 = require("../game/engine");
const db_1 = require("../db");
const bot_1 = require("../game/bot");
const matchmaking_1 = require("../game/matchmaking");
const activeConnections = new Map();
const disconnectTimers = new Map();
const userSockets = new Map(); // userId -> socketId
const socketRateLimit = new Map();
const MAX_EVENTS_PER_SECOND = 10;
function registerGameSockets(io) {
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
    io.on("connection", (socket) => {
        console.log("Player connected:", socket.id);
        socket.on("register_user", ({ userId }) => {
            if (!checkRateLimit(socket.id)) {
                return socket.emit("error", { message: "Rate limit exceeded" });
            }
            userSockets.set(userId, socket.id);
        });
        socket.on("find_table", async ({ userId, entryFee }) => {
            if (!checkRateLimit(socket.id)) {
                return socket.emit("error", { message: "Rate limit exceeded" });
            }
            await (0, matchmaking_1.joinQueue)(userId, entryFee, async ({ gameId, playerIds }) => {
                // Notify all 4 players they have a game
                for (const pid of playerIds) {
                    const sid = userSockets.get(pid);
                    if (sid) {
                        io.to(sid).emit("match_found", { gameId });
                    }
                }
            });
        });
        socket.on("place_bid", async ({ gameId, userId, bid }) => {
            if (!checkRateLimit(socket.id)) {
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
                if (err?.message === "Game action already in progress") {
                    socket.emit("error", { message: "Action already in progress. Please retry." });
                    return;
                }
                socket.emit("error", { message: err?.message ?? "Unable to place bid" });
            }
        });
        socket.on("play_card", async ({ gameId, userId, card }) => {
            if (!checkRateLimit(socket.id)) {
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
                if (err?.message === "Game action already in progress") {
                    socket.emit("error", { message: "Action already in progress. Please retry." });
                    return;
                }
                socket.emit("error", { message: err?.message ?? "Unable to play card" });
            }
        });
        socket.on("join_game", async ({ gameId, userId }) => {
            if (!checkRateLimit(socket.id)) {
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
                socket.emit("error", { message: "Player not found in game" });
                return;
            }
            activeConnections.set(socket.id, {
                gameId,
                seat: player.seat,
            });
            // If reconnecting -> cancel timer
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
            console.log(`User ${userId} joined game ${gameId}`);
        });
        socket.on("start_game", async ({ gameId }) => {
            if (!checkRateLimit(socket.id)) {
                return socket.emit("error", { message: "Rate limit exceeded" });
            }
            try {
                const state = await (0, engine_1.startGame)(gameId);
                io.to(gameId).emit("game_started", state);
            }
            catch (err) {
                console.error(err);
                socket.emit("error", { message: "Unable to start game" });
            }
        });
        socket.on("disconnect", async () => {
            for (const [uid, sid] of userSockets.entries()) {
                if (sid === socket.id)
                    userSockets.delete(uid);
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
            // Start 30-second timer
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
