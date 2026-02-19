import { GamePhase } from "@prisma/client";
import { prisma } from "../db";
import { triggerBotMoveSafely } from "./bot";
import { logger } from "../utils/logger";

const turnTimers = new Map<string, NodeJS.Timeout>();

const TURN_TIMEOUT_MS = 8000; // 8 seconds per move
const DEFAULT_TIMEOUT_BID = 2;

export function startTurnTimer(gameId: string) {
  clearTurnTimer(gameId);

  const timer = setTimeout(async () => {
    try {
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

      if (!player.isBot) {
        await prisma.gamePlayer.update({
          where: { id: player.id },
          data: {
            isBot: true,
            replacedByBot: true,
          },
        });
      }

      await triggerBotMoveSafely(gameId, "turn.timeout");
    } catch (err) {
      logger.error({ err, gameId }, "Turn timeout handler failed");
    }
  }, TURN_TIMEOUT_MS);

  turnTimers.set(gameId, timer);
}

export function clearTurnTimer(gameId: string) {
  const existing = turnTimers.get(gameId);
  if (existing) {
    clearTimeout(existing);
    turnTimers.delete(gameId);
  }
}
