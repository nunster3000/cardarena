"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startTurnTimer = startTurnTimer;
exports.clearTurnTimer = clearTurnTimer;
const db_1 = require("../db");
const bot_1 = require("./bot");
const turnTimers = new Map();
const TURN_TIMEOUT_MS = 15000; // 15 seconds per move
function startTurnTimer(gameId) {
    clearTurnTimer(gameId);
    const timer = setTimeout(async () => {
        console.log(`Turn timeout for game ${gameId}`);
        const game = await db_1.prisma.game.findUnique({
            where: { id: gameId },
        });
        if (!game)
            return;
        const state = game.state;
        const currentSeat = state.currentTurnSeat;
        const player = await db_1.prisma.gamePlayer.findFirst({
            where: { gameId, seat: currentSeat },
        });
        if (!player)
            return;
        // If human timed out → force bot move
        if (!player.isBot) {
            console.log(`Seat ${currentSeat} timed out. Auto-replacing.`);
            await db_1.prisma.gamePlayer.update({
                where: { id: player.id },
                data: {
                    isBot: true,
                    replacedByBot: true,
                },
            });
        }
        await (0, bot_1.triggerBotMove)(gameId);
    }, TURN_TIMEOUT_MS);
    turnTimers.set(gameId, timer);
}
function clearTurnTimer(gameId) {
    const existing = turnTimers.get(gameId);
    if (existing) {
        clearTimeout(existing);
        turnTimers.delete(gameId);
    }
}
