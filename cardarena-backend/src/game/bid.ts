import { prisma } from "../db";
import { GamePhase } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { triggerBotMove } from "./bot";
import { getIO } from "../socket/io";
import { withGameLock } from "./gameLocks";
import { startTurnTimer } from "./turnManager";

export async function submitBid(
  gameId: string,
  playerSeat: number,
  bidValue: number
) {
  return withGameLock(gameId, async () => {
    const game = await prisma.game.findUnique({
      where: { id: gameId },
    });

    if (!game) {
      throw new Error("Game not found");
    }

    if (game.phase !== GamePhase.BIDDING) {
      throw new Error("Not in bidding phase");
    }

  const state = game.state as any;

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

  let nextPhase: GamePhase = GamePhase.BIDDING;

  if (allBidsPlaced) {
    nextPhase = GamePhase.PLAYING;

    // First play turn = left of dealer
    const dealerSeat = state.dealerSeat;
    state.currentTurnSeat = dealerSeat === 4 ? 1 : dealerSeat + 1;
  }

  await prisma.game.update({
    where: { id: gameId },
    data: {
      state: state as Prisma.InputJsonObject,
      phase: nextPhase,
    },
  });

  await prisma.gameMoveAudit.create({
    data: {
      gameId,
      playerId: playerSeat.toString(),
      type: "BID",
      payload: { bid: bidValue },
    },
  });

  const updatedState = state;
  getIO().to(gameId).emit("game_state", updatedState);
  startTurnTimer(gameId);

    await triggerBotMove(gameId);

    return state;
  });
}

export const placeBid = submitBid;
