// src/game/scoring.ts

import { prisma } from "../db";
import { GamePhase, GameStatus } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { settleTournamentFromGame } from "./tournamentSettlement";
import { emitGameStateForGame } from "./emitGameState";

export async function resolveHand(gameId: string) {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
  });

  if (!game) throw new Error("Game not found");

  const state = game.state as any;

  if (!state) throw new Error("Game state missing");

  const teamABid = Number(state.bids?.[1] || 0) + Number(state.bids?.[3] || 0);
  const teamBBid = Number(state.bids?.[2] || 0) + Number(state.bids?.[4] || 0);

  const teamATricks = Number(state.teamATricks || 0);
  const teamBTricks = Number(state.teamBTricks || 0);

  // --------------------------
  // SCORE CALCULATION
  // --------------------------

  let teamAScoreDelta = 0;
  let teamBScoreDelta = 0;

  // TEAM A
  if (teamATricks < teamABid) {
    teamAScoreDelta = -teamABid * 10;
    state.teamASets = (state.teamASets || 0) + 1;
  } else {
    teamAScoreDelta = teamABid * 10;
  }

  // TEAM B
  if (teamBTricks < teamBBid) {
    teamBScoreDelta = -teamBBid * 10;
    state.teamBSets = (state.teamBSets || 0) + 1;
  } else {
    teamBScoreDelta = teamBBid * 10;
  }

  state.teamAScore = (state.teamAScore || 0) + teamAScoreDelta;
  state.teamBScore = (state.teamBScore || 0) + teamBScoreDelta;

  // Check win condition
  const teamAScore = state.teamAScore;
  const teamBScore = state.teamBScore;
  const teamASets = state.teamASets;
  const teamBSets = state.teamBSets;

  const teamAWin = teamAScore >= 300 || teamBSets >= 2;
  const teamBWin = teamBScore >= 300 || teamASets >= 2;

  if (teamAWin || teamBWin) {
    state.phase = GamePhase.GAME_COMPLETE;

    await prisma.game.update({
      where: { id: gameId },
      data: {
        status: GameStatus.COMPLETED,
        winnerTeam: teamAWin ? "TEAM_A" : "TEAM_B",
        state: state as Prisma.InputJsonObject,
      },
    });

    const updatedState = state;
    await emitGameStateForGame(gameId, updatedState);

    // Auto-settle tournament
    await settleTournamentFromGame(gameId);

    return;
  }

  // Rotate dealer clockwise
  const dealerSeat = state.dealerSeat;
  state.dealerSeat = dealerSeat === 4 ? 1 : dealerSeat + 1;

  // Reset hand state
  state.phase = GamePhase.DEALING;
  state.bids = {};
  state.trick = [];
  state.completedTricks = 0;
  state.teamATricks = 0;
  state.teamBTricks = 0;
  state.handNumber = (state.handNumber || 1) + 1;

  // You will call deal logic again
  await prisma.game.update({
    where: { id: gameId },
    data: {
      state: state as Prisma.InputJsonObject,
    },
  });

  const updatedState = state;
  await emitGameStateForGame(gameId, updatedState);

  return state;
}

export async function scoreHand(gameId: string) {
  return resolveHand(gameId);
}
