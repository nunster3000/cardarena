import { GameState } from "./types";

export function resolveHand(state: GameState) {
  const teamABid =
    (state.bids[1] || 0) + (state.bids[3] || 0);

  const teamBBid =
    (state.bids[2] || 0) + (state.bids[4] || 0);

  // --- Team A ---
  if (state.teamATricks < teamABid) {
    state.teamASets += 1;
    state.teamAScore -= teamABid * 10;
  } else {
    state.teamAScore += teamABid * 10;
  }

  // --- Team B ---
  if (state.teamBTricks < teamBBid) {
    state.teamBSets += 1;
    state.teamBScore -= teamBBid * 10;
  } else {
    state.teamBScore += teamBBid * 10;
  }

  // Reset trick counters
  state.teamATricks = 0;
  state.teamBTricks = 0;

  state.bids = {};
  state.completedTricks = [];

  state.handNumber += 1;

  return state;
}
