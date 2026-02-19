import { prisma } from "../db";
import { GamePhase } from "@prisma/client";
import { playCard } from "./play";
import { submitBid } from "./bid";
import { logger } from "../utils/logger";

export async function triggerBotMove(gameId: string) {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: { players: true },
  });

  if (!game) return;

  const state = game.state as any;
  const currentSeat = state.currentTurnSeat;

  const player = game.players.find(
    (p) => p.seat === currentSeat
  );

  if (!player || !player.isBot) return;

  if (game.phase === GamePhase.BIDDING) {
    const randomBid = Math.floor(Math.random() * 5) + 1;
    await submitBid(gameId, currentSeat, randomBid);
    return;
  }

  if (game.phase === GamePhase.PLAYING) {
    const hand = state.hands[currentSeat];

    if (!hand || hand.length === 0) return;

    const card = hand[0]; // simple bot logic

    await playCard(gameId, currentSeat, card);
  }
}

export async function triggerBotMoveSafely(gameId: string, source: string) {
  try {
    await triggerBotMove(gameId);
  } catch (err: any) {
    if (err?.message === "Game action already in progress") {
      logger.warn({ gameId, source }, "Skipped bot move due to in-progress action lock");
      return;
    }
    logger.error({ err, gameId, source }, "Bot move failed");
  }
}
