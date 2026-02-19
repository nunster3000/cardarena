"use strict";
// src/game/disconnect.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleDisconnect = handleDisconnect;
exports.handleReconnect = handleReconnect;
const db_1 = require("../db");
const bot_1 = require("./bot");
const DISCONNECT_TIMEOUT = 30 * 1000; // 30 seconds
const MAX_DISCONNECTS = 5;
const pendingReconnects = new Map();
async function handleDisconnect(gameId, userId) {
    const game = await db_1.prisma.game.findUnique({
        where: { id: gameId },
        include: { players: true },
    });
    if (!game)
        return;
    const player = game.players.find(p => p.userId === userId);
    if (!player)
        return;
    // Pause game
    await db_1.prisma.game.update({
        where: { id: gameId },
        data: { status: "PAUSED" },
    });
    const timeout = setTimeout(async () => {
        await replaceWithBot(gameId, player.id, userId);
        pendingReconnects.delete(userId);
    }, DISCONNECT_TIMEOUT);
    pendingReconnects.set(userId, timeout);
}
async function handleReconnect(gameId, userId) {
    const timeout = pendingReconnects.get(userId);
    if (timeout) {
        clearTimeout(timeout);
        pendingReconnects.delete(userId);
    }
    await db_1.prisma.game.update({
        where: { id: gameId },
        data: { status: "ACTIVE" },
    });
}
async function replaceWithBot(gameId, gamePlayerId, userId) {
    await db_1.prisma.$transaction(async (tx) => {
        await tx.gamePlayer.update({
            where: { id: gamePlayerId },
            data: {
                isBot: true,
                replacedByBot: true,
            },
        });
        const user = await tx.user.findUnique({ where: { id: userId } });
        if (user) {
            const newCount = user.disconnectCount + 1;
            await tx.user.update({
                where: { id: userId },
                data: {
                    disconnectCount: newCount,
                    isSuspended: newCount >= MAX_DISCONNECTS,
                    lastDisconnectAt: new Date(),
                },
            });
        }
        await tx.game.update({
            where: { id: gameId },
            data: { status: "ACTIVE" },
        });
    });
    await (0, bot_1.triggerBotMoveSafely)(gameId, "disconnect.replaceWithBot");
}
