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
exports.startTurnTimer = startTurnTimer;
exports.clearTurnTimer = clearTurnTimer;
const client_1 = require("@prisma/client");
const db_1 = require("../db");
const play_1 = require("./play");
const bot_1 = require("./bot");
const logger_1 = require("../utils/logger");
const emitGameState_1 = require("./emitGameState");
const turnTimers = new Map();
const TURN_TIMEOUT_MS = 8000; // 8 seconds per move
const DEFAULT_TIMEOUT_BID = 2;
async function syncTurnDeadline(gameId, deadlineAt) {
    const game = await db_1.prisma.game.findUnique({
        where: { id: gameId },
        select: { state: true },
    });
    if (!game?.state || typeof game.state !== "object")
        return;
    const nextState = {
        ...game.state,
        turnDeadlineAt: deadlineAt,
        turnTimeoutMs: TURN_TIMEOUT_MS,
    };
    await db_1.prisma.game.update({
        where: { id: gameId },
        data: {
            state: nextState,
        },
    });
    await (0, emitGameState_1.emitGameStateForGame)(gameId, nextState);
}
function chooseTimeoutCard(state, seat) {
    const hand = Array.isArray(state?.hands?.[seat])
        ? state.hands[seat]
        : [];
    if (!hand.length)
        return null;
    const trick = Array.isArray(state?.trick)
        ? state.trick
        : [];
    // Leading card: avoid breaking spades if possible.
    if (trick.length === 0) {
        const spadesBroken = state?.spadesBroken === true;
        if (!spadesBroken) {
            const nonSpade = hand.find((c) => c.suit !== "SPADES");
            if (nonSpade)
                return nonSpade;
        }
        return hand[0];
    }
    // Must follow suit when possible.
    const leadSuit = trick[0]?.suit;
    if (leadSuit) {
        const follow = hand.find((c) => c.suit === leadSuit);
        if (follow)
            return follow;
    }
    return hand[0];
}
function startTurnTimer(gameId) {
    clearTurnTimer(gameId);
    const deadlineAt = Date.now() + TURN_TIMEOUT_MS;
    const timer = setTimeout(async () => {
        try {
            const activeTimer = turnTimers.get(gameId);
            if (!activeTimer || activeTimer.handle !== timer) {
                return;
            }
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
            if (game.phase === client_1.GamePhase.BIDDING) {
                const { submitBid } = await Promise.resolve().then(() => __importStar(require("./bid")));
                await submitBid(gameId, currentSeat, DEFAULT_TIMEOUT_BID);
                return;
            }
            if (game.phase === client_1.GamePhase.PLAYING) {
                const timeoutCard = chooseTimeoutCard(state, currentSeat);
                if (!timeoutCard)
                    return;
                await (0, play_1.playCard)(gameId, currentSeat, {
                    suit: timeoutCard.suit,
                    rank: String(timeoutCard.rank),
                });
                return;
            }
            await (0, bot_1.triggerBotMoveSafely)(gameId, "turn.timeout.other");
        }
        catch (err) {
            logger_1.logger.error({ err, gameId }, "Turn timeout handler failed");
        }
    }, TURN_TIMEOUT_MS);
    turnTimers.set(gameId, { handle: timer });
    void syncTurnDeadline(gameId, deadlineAt).catch((err) => {
        logger_1.logger.error({ err, gameId }, "Failed to sync turn deadline");
    });
}
function clearTurnTimer(gameId) {
    const existing = turnTimers.get(gameId);
    if (existing) {
        clearTimeout(existing.handle);
        turnTimers.delete(gameId);
    }
    void syncTurnDeadline(gameId, null).catch((err) => {
        logger_1.logger.error({ err, gameId }, "Failed to clear turn deadline");
    });
}
