// src/game/types.ts
import { GamePhase } from "@prisma/client";

export interface CardState {
  suit: string;
  rank: string | number;
}

export interface TrickCard extends CardState {
  seat: number;
}

export interface GameState {
  dealerSeat: number;
  currentTurnSeat: number;

  hands: Record<number, CardState[]>;

  bids: Record<number, number>;

  trick: TrickCard[];
  completedTricks: number;

   teamATricks: number;
  teamBTricks: number;

  teamAScore: number;
  teamBScore: number;

  teamASets: number;
  teamBSets: number;

  spadesBroken: boolean;

  handNumber: number;
  phase?: GamePhase;
}
