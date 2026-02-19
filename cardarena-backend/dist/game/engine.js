"use strict";
// src/game/engine.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.startGame = startGame;
const db_1 = require("../db");
const deck_1 = require("./deck");
const client_1 = require("@prisma/client");
const turnManager_1 = require("./turnManager");
const emitGameState_1 = require("./emitGameState");
/**
 * Starts a game when 4 players are ready
 */
async function startGame(gameId) {
    const game = await db_1.prisma.game.findUnique({
        where: { id: gameId },
        include: { players: true },
    });
    if (!game) {
        throw new Error("Game not found");
    }
    if (game.players.length !== 4) {
        throw new Error("Game must have 4 players to start");
    }
    // Random dealer seat (1–4)
    const dealerSeat = Math.floor(Math.random() * 4) + 1;
    // Shuffle deck
    const deck = (0, deck_1.shuffleDeck)((0, deck_1.createDeck)());
    // Deal cards starting from dealer's left so dealer gets the last card.
    const firstSeatToDeal = dealerSeat === 4 ? 1 : dealerSeat + 1;
    const hands = (0, deck_1.dealCards)(deck, firstSeatToDeal);
    const handsForState = Object.fromEntries(Object.entries(hands).map(([seat, cards]) => [
        seat,
        cards.map((card) => ({ suit: card.suit, rank: card.rank })),
    ]));
    // First turn is player left of dealer
    const currentTurnSeat = dealerSeat === 4 ? 1 : dealerSeat + 1;
    const initialState = {
        dealerSeat,
        currentTurnSeat,
        hands: handsForState,
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
    await db_1.prisma.game.update({
        where: { id: gameId },
        data: {
            status: client_1.GameStatus.ACTIVE,
            phase: client_1.GamePhase.BIDDING,
            state: initialState,
        },
    });
    const updatedState = initialState;
    await (0, emitGameState_1.emitGameStateForGame)(gameId, updatedState);
    (0, turnManager_1.startTurnTimer)(gameId);
    return initialState;
}
