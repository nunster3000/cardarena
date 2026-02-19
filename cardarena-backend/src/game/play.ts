// src/game/play.ts

import { prisma } from "../db";
import { GamePhase } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { GameState } from "./types";
import { scoreHand } from "./scoring";
import { triggerBotMove } from "./bot";
import { withGameLock } from "./gameLocks";
import { clearTurnTimer, startTurnTimer } from "./turnManager";
import { emitGameStateForGame } from "./emitGameState";



export async function playCard(
  gameId: string,
  playerSeat: number,
  card: { suit: string; rank: string }
) {
  return withGameLock(gameId, async () => {
    clearTurnTimer(gameId);

    const game = await prisma.game.findUnique({
      where: { id: gameId },
    });

    if (!game) throw new Error("Game not found");

    if (game.phase !== GamePhase.PLAYING) {
      throw new Error("Game is not in PLAYING phase");
    }

    const state = game.state as unknown as GameState;

    if (!state) throw new Error("Game state missing");

    if (state.currentTurnSeat !== playerSeat) {
      throw new Error("Not your turn");
    }

  const hands = state.hands as any;
  const playerHand = hands[playerSeat] as any[];

  const cardIndex = playerHand.findIndex(
    (c: any) => c.suit === card.suit && String(c.rank) === String(card.rank)
  );

  if (cardIndex === -1) {
    throw new Error("Card not in player's hand");
  }

  const trick = state.trick as any[];

  // =========================
  // 🚫 SPADES LEAD RESTRICTION
  // =========================
  const isLeading = trick.length === 0;

  if (isLeading) {
    const spadesBroken = state.spadesBroken === true;

    const onlySpadesLeft = playerHand.every(
      (c: any) => c.suit === "SPADES"
    );

    if (
      card.suit === "SPADES" &&
      !spadesBroken &&
      !onlySpadesLeft
    ) {
      throw new Error("Spades have not been broken yet");
    }
  }

  // =========================
  // 🚫 RENEGING PROTECTION
  // =========================
  if (trick.length > 0) {
    const leadSuit = trick[0].suit;

    const hasLeadSuit = playerHand.some(
      (c: any) => c.suit === leadSuit
    );

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

    const getRankValue = (rank: string | number) => {
      if (typeof rank === "number") return rank;
      const fromList = rankOrder.indexOf(rank);
      if (fromList !== -1) return fromList + 2;
      const parsed = Number(rank);
      return Number.isNaN(parsed) ? -1 : parsed;
    };

    const isTrumpSuit = (suit: string) => suit === "SPADES";

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

      const canCompete =
        cardSuit === winningSuit ||
        (!winningIsTrump &&
          !isTrump &&
          cardSuit === leadSuit &&
          winningSuit !== leadSuit);

      if (
        canCompete &&
        getRankValue(cardPlayed.rank) > getRankValue(winningCard.rank)
      ) {
        winningCard = cardPlayed;
      }
    }

    const winningSeat = Number(winningCard.seat);

    if (state.teamATricks == null) state.teamATricks = 0;
    if (state.teamBTricks == null) state.teamBTricks = 0;


    if (winningSeat === 1 || winningSeat === 3) {
      state.teamATricks += 1;
    } else {
      state.teamBTricks += 1;
    }

    // Reset trick
    state.trick = [];

    // Winner leads next trick
    state.currentTurnSeat = winningSeat;

    // Increment completed tricks
    (state as any).completedTricks = ((state as any).completedTricks || 0) + 1;

    // If 13 tricks completed -> move to SCORING
    if ((state as any).completedTricks === 13) {
      state.phase = GamePhase.SCORING;

      await prisma.game.update({
        where: { id: gameId },
        data: {
          state: state as unknown as Prisma.InputJsonObject,
        },
      });

      const updatedState = state;
      await emitGameStateForGame(gameId, updatedState);

      // Call scoring engine
      await scoreHand(gameId);

      // Stop further execution
      return;
    }
  }

  await prisma.game.update({
    where: { id: gameId },
    data: {
      state: state as unknown as Prisma.InputJsonObject,
    },
  });

  await prisma.gameMoveAudit.create({
    data: {
      gameId,
      playerId: playerSeat.toString(),
      type: "PLAY_CARD",
      payload: card,
    },
  });

  const updatedState = state;
  await emitGameStateForGame(gameId, updatedState);
  startTurnTimer(gameId);

    await triggerBotMove(gameId);

    return state;
  });
}


