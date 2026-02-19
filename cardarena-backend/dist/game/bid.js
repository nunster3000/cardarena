"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.placeBid = void 0;
exports.submitBid = submitBid;
const db_1 = require("../db");
const client_1 = require("@prisma/client");
const bot_1 = require("./bot");
const gameLocks_1 = require("./gameLocks");
const turnManager_1 = require("./turnManager");
const emitGameState_1 = require("./emitGameState");
async function submitBid(gameId, playerSeat, bidValue) {
    return (0, gameLocks_1.withGameLock)(gameId, async () => {
        const game = await db_1.prisma.game.findUnique({
            where: { id: gameId },
        });
        if (!game) {
            throw new Error("Game not found");
        }
        if (game.phase !== client_1.GamePhase.BIDDING) {
            throw new Error("Not in bidding phase");
        }
        const state = game.state;
        if (state.currentTurnSeat !== playerSeat) {
            throw new Error("Not your turn to bid");
        }
        if (bidValue < 0 || bidValue > 13) {
            throw new Error("Invalid bid");
        }
        // Store bid
        state.bids[playerSeat] = bidValue;
        // Determine next turn
        const nextSeat = playerSeat === 4 ? 1 : playerSeat + 1;
        state.currentTurnSeat = nextSeat;
        const allBidsPlaced = Object.keys(state.bids).length === 4;
        let nextPhase = client_1.GamePhase.BIDDING;
        if (allBidsPlaced) {
            nextPhase = client_1.GamePhase.PLAYING;
            // First play turn = left of dealer
            const dealerSeat = state.dealerSeat;
            state.currentTurnSeat = dealerSeat === 4 ? 1 : dealerSeat + 1;
        }
        await db_1.prisma.game.update({
            where: { id: gameId },
            data: {
                state: state,
                phase: nextPhase,
            },
        });
        await db_1.prisma.gameMoveAudit.create({
            data: {
                gameId,
                playerId: playerSeat.toString(),
                type: "BID",
                payload: { bid: bidValue },
            },
        });
        const updatedState = state;
        await (0, emitGameState_1.emitGameStateForGame)(gameId, updatedState);
        (0, turnManager_1.startTurnTimer)(gameId);
        await (0, bot_1.triggerBotMoveSafely)(gameId, "bid.submit");
        return state;
    });
}
exports.placeBid = submitBid;
