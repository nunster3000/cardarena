// src/game/engine.ts

import { prisma } from "../db";
import { createDeck, shuffleDeck, dealCards } from "./deck";
import { GamePhase, GameStatus } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { startTurnTimer } from "./turnManager";
import { emitGameStateForGame } from "./emitGameState";


/**
 * Starts a game when 4 players are ready
 */
export async function startGame(gameId: string) {
  const game = await prisma.game.findUnique({
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
  const deck = shuffleDeck(createDeck());

  // Deal cards starting from dealer's left so dealer gets the last card.
  const firstSeatToDeal = dealerSeat === 4 ? 1 : dealerSeat + 1;
  const hands = dealCards(deck, firstSeatToDeal);
  const handsForState = Object.fromEntries(
    Object.entries(hands).map(([seat, cards]) => [
      seat,
      cards.map((card) => ({ suit: card.suit, rank: card.rank })) as Prisma.InputJsonArray,
    ])
  ) as Prisma.InputJsonObject;

  // First turn is player left of dealer
  const currentTurnSeat = dealerSeat === 4 ? 1 : dealerSeat + 1;

  const initialState: Prisma.InputJsonObject = {
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

  await prisma.game.update({
    where: { id: gameId },
    data: {
      status: GameStatus.ACTIVE,
      phase: GamePhase.BIDDING,
      state: initialState,
    },
  });

  const updatedState = initialState;
  await emitGameStateForGame(gameId, updatedState);
  startTurnTimer(gameId);

  return initialState;
}
