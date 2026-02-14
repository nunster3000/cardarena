import { prisma } from "../db";
import { triggerBotMove } from "./bot";

const turnTimers = new Map<string, NodeJS.Timeout>();

const TURN_TIMEOUT_MS = 15000; // 15 seconds per move

export function startTurnTimer(gameId: string) {
  clearTurnTimer(gameId);

  const timer = setTimeout(async () => {
    console.log(`Turn timeout for game ${gameId}`);

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

    // If human timed out → force bot move
    if (!player.isBot) {
      console.log(`Seat ${currentSeat} timed out. Auto-replacing.`);
      await prisma.gamePlayer.update({
        where: { id: player.id },
        data: {
          isBot: true,
          replacedByBot: true,
        },
      });
    }

    await triggerBotMove(gameId);

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
