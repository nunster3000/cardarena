"use strict";
// src/game/play.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.playCard = playCard;
const db_1 = require("../db");
const client_1 = require("@prisma/client");
const scoring_1 = require("./scoring");
const bot_1 = require("./bot");
const gameLocks_1 = require("./gameLocks");
const turnManager_1 = require("./turnManager");
const emitGameState_1 = require("./emitGameState");
async function playCard(gameId, playerSeat, card) {
    return (0, gameLocks_1.withGameLock)(gameId, async () => {
        (0, turnManager_1.clearTurnTimer)(gameId);
        const game = await db_1.prisma.game.findUnique({
            where: { id: gameId },
        });
        if (!game)
            throw new Error("Game not found");
        if (game.phase !== client_1.GamePhase.PLAYING) {
            throw new Error("Game is not in PLAYING phase");
        }
        const state = game.state;
        if (!state)
            throw new Error("Game state missing");
        state.phase = client_1.GamePhase.PLAYING;
        if (state.currentTurnSeat !== playerSeat) {
            throw new Error("Not your turn");
        }
        const hands = state.hands;
        const playerHand = hands[playerSeat];
        const cardIndex = playerHand.findIndex((c) => c.suit === card.suit && String(c.rank) === String(card.rank));
        if (cardIndex === -1) {
            throw new Error("Card not in player's hand");
        }
        const trick = state.trick;
        // =========================
        // 🚫 SPADES LEAD RESTRICTION
        // =========================
        const isLeading = trick.length === 0;
        if (isLeading) {
            const spadesBroken = state.spadesBroken === true;
            const onlySpadesLeft = playerHand.every((c) => c.suit === "SPADES");
            if (card.suit === "SPADES" &&
                !spadesBroken &&
                !onlySpadesLeft) {
                throw new Error("Spades have not been broken yet");
            }
        }
        // =========================
        // 🚫 RENEGING PROTECTION
        // =========================
        if (trick.length > 0) {
            const leadSuit = trick[0].suit;
            const hasLeadSuit = playerHand.some((c) => c.suit === leadSuit);
            if (hasLeadSuit && card.suit !== leadSuit) {
                throw new Error("You must follow suit");
            }
        }
        // Remove card from hand
        playerHand.splice(cardIndex, 1);
        // Add to trick
        trick.push({
            seat: playerSeat,
            suit: card.suit,
            rank: card.rank,
        });
        // =========================
        // 🃏 BREAK SPADES IF PLAYED
        // =========================
        if (card.suit === "SPADES" && !state.spadesBroken) {
            state.spadesBroken = true;
        }
        // Rotate turn
        const nextSeat = playerSeat === 4 ? 1 : playerSeat + 1;
        state.currentTurnSeat = nextSeat;
        // =========================
        // 🎯 RESOLVE TRICK
        // =========================
        if (trick.length === 4) {
            const leadSuit = trick[0].suit;
            const rankOrder = [
                "2", "3", "4", "5", "6", "7", "8", "9", "10",
                "J", "Q", "K", "A",
            ];
            const getRankValue = (rank) => {
                if (typeof rank === "number")
                    return rank;
                const fromList = rankOrder.indexOf(rank);
                if (fromList !== -1)
                    return fromList + 2;
                const parsed = Number(rank);
                return Number.isNaN(parsed) ? -1 : parsed;
            };
            const isTrumpSuit = (suit) => suit === "SPADES";
            let winningCard = trick[0];
            for (const cardPlayed of trick) {
                const isTrump = isTrumpSuit(cardPlayed.suit);
                const winningIsTrump = isTrumpSuit(winningCard.suit);
                if (isTrump && !winningIsTrump) {
                    winningCard = cardPlayed;
                    continue;
                }
                const cardSuit = cardPlayed.suit;
                const winningSuit = winningCard.suit;
                const canCompete = cardSuit === winningSuit ||
                    (!winningIsTrump &&
                        !isTrump &&
                        cardSuit === leadSuit &&
                        winningSuit !== leadSuit);
                if (canCompete &&
                    getRankValue(cardPlayed.rank) > getRankValue(winningCard.rank)) {
                    winningCard = cardPlayed;
                }
            }
            const winningSeat = Number(winningCard.seat);
            if (state.teamATricks == null)
                state.teamATricks = 0;
            if (state.teamBTricks == null)
                state.teamBTricks = 0;
            if (winningSeat === 1 || winningSeat === 3) {
                state.teamATricks += 1;
            }
            else {
                state.teamBTricks += 1;
            }
            // Reset trick
            state.trick = [];
            // Winner leads next trick
            state.currentTurnSeat = winningSeat;
            // Increment completed tricks
            state.completedTricks = (state.completedTricks || 0) + 1;
            // If 13 tricks completed -> move to SCORING
            if (state.completedTricks === 13) {
                state.phase = client_1.GamePhase.SCORING;
                await db_1.prisma.game.update({
                    where: { id: gameId },
                    data: {
                        state: state,
                    },
                });
                const updatedState = state;
                await (0, emitGameState_1.emitGameStateForGame)(gameId, updatedState);
                // Call scoring engine
                await (0, scoring_1.scoreHand)(gameId);
                // Stop further execution
                return;
            }
        }
        await db_1.prisma.game.update({
            where: { id: gameId },
            data: {
                state: state,
            },
        });
        await db_1.prisma.gameMoveAudit.create({
            data: {
                gameId,
                playerId: playerSeat.toString(),
                type: "PLAY_CARD",
                payload: card,
            },
        });
        const updatedState = state;
        await (0, emitGameState_1.emitGameStateForGame)(gameId, updatedState);
        (0, turnManager_1.startTurnTimer)(gameId);
        await (0, bot_1.triggerBotMoveSafely)(gameId, "play.submit");
        return state;
    });
}
