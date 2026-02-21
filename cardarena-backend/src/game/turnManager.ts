import { GamePhase } from "@prisma/client";
import { prisma } from "../db";
import { playCard } from "./play";
import { triggerBotMoveSafely } from "./bot";
import { logger } from "../utils/logger";
import { Prisma } from "@prisma/client";
import { emitGameStateForGame } from "./emitGameState";

type TurnTimerEntry = {
  handle: NodeJS.Timeout;
};

const turnTimers = new Map<string, TurnTimerEntry>();

const TURN_TIMEOUT_MS = 8000; // 8 seconds per move
const DEFAULT_TIMEOUT_BID = 2;

async function syncTurnDeadline(gameId: string, deadlineAt: number | null) {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: { state: true },
  });
  if (!game?.state || typeof game.state !== "object") return;

  const nextState = {
    ...(game.state as Record<string, unknown>),
    turnDeadlineAt: deadlineAt,
    turnTimeoutMs: TURN_TIMEOUT_MS,
  };

  await prisma.game.update({
    where: { id: gameId },
    data: {
      state: nextState as Prisma.InputJsonObject,
    },
  });

  await emitGameStateForGame(gameId, nextState);
}

function chooseTimeoutCard(state: any, seat: number) {
  const hand: Array<{ suit: string; rank: string | number }> = Array.isArray(state?.hands?.[seat])
    ? state.hands[seat]
    : [];
  if (!hand.length) return null;

  const trick: Array<{ suit: string; rank: string | number; seat: number }> = Array.isArray(state?.trick)
    ? state.trick
    : [];

  // Leading card: avoid breaking spades if possible.
  if (trick.length === 0) {
    const spadesBroken = state?.spadesBroken === true;
    if (!spadesBroken) {
      const nonSpade = hand.find((c) => c.suit !== "SPADES");
      if (nonSpade) return nonSpade;
    }
    return hand[0];
  }

  // Must follow suit when possible.
  const leadSuit = trick[0]?.suit;
  if (leadSuit) {
    const follow = hand.find((c) => c.suit === leadSuit);
    if (follow) return follow;
  }

  return hand[0];
}

export function startTurnTimer(gameId: string) {
  clearTurnTimer(gameId);
  const deadlineAt = Date.now() + TURN_TIMEOUT_MS;

  const timer = setTimeout(async () => {
    try {
      const activeTimer = turnTimers.get(gameId);
      if (!activeTimer || activeTimer.handle !== timer) {
        return;
      }

      const game = await prisma.game.findUnique({
        where: { id: gameId },
      });
      if (!game) return;

      const state = game.state as any;
      const currentSeat = state.currentTurnSeat;

      const player = await prisma.gamePlayer.findFirst({
        where: { gameId, seat: currentSeat },
      });
      if (!player) return;

      if (game.phase === GamePhase.BIDDING) {
        const { submitBid } = await import("./bid");
        await submitBid(gameId, currentSeat, DEFAULT_TIMEOUT_BID);
        return;
      }

      if (game.phase === GamePhase.PLAYING) {
        const timeoutCard = chooseTimeoutCard(state, currentSeat);
        if (!timeoutCard) return;
        await playCard(gameId, currentSeat, {
          suit: timeoutCard.suit,
          rank: String(timeoutCard.rank),
        });
        return;
      }

      await triggerBotMoveSafely(gameId, "turn.timeout.other");
    } catch (err) {
      logger.error({ err, gameId }, "Turn timeout handler failed");
    }
  }, TURN_TIMEOUT_MS);

  turnTimers.set(gameId, { handle: timer });
  void syncTurnDeadline(gameId, deadlineAt).catch((err) => {
    logger.error({ err, gameId }, "Failed to sync turn deadline");
  });
}

export function clearTurnTimer(gameId: string) {
  const existing = turnTimers.get(gameId);
  if (existing) {
    clearTimeout(existing.handle);
    turnTimers.delete(gameId);
  }
  void syncTurnDeadline(gameId, null).catch((err) => {
    logger.error({ err, gameId }, "Failed to clear turn deadline");
  });
}
