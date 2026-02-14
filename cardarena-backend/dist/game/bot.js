"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.triggerBotMove = triggerBotMove;
const db_1 = require("../db");
const client_1 = require("@prisma/client");
const play_1 = require("./play");
const bid_1 = require("./bid");
async function triggerBotMove(gameId) {
    const game = await db_1.prisma.game.findUnique({
        where: { id: gameId },
        include: { players: true },
    });
    if (!game)
        return;
    const state = game.state;
    const currentSeat = state.currentTurnSeat;
    const player = game.players.find((p) => p.seat === currentSeat);
    if (!player || !player.isBot)
        return;
    if (game.phase === client_1.GamePhase.BIDDING) {
        const randomBid = Math.floor(Math.random() * 5) + 1;
        await (0, bid_1.submitBid)(gameId, currentSeat, randomBid);
        return;
    }
    if (game.phase === client_1.GamePhase.PLAYING) {
        const hand = state.hands[currentSeat];
        if (!hand || hand.length === 0)
            return;
        const card = hand[0]; // simple bot logic
        await (0, play_1.playCard)(gameId, currentSeat, card);
    }
}
