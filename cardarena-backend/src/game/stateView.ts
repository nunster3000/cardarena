type Card = { suit: string; rank: string | number };

type RawGameState = {
  hands?: Record<string, Card[]>;
  [key: string]: unknown;
};

export function serializeGameStateForSeat(rawState: unknown, seat: number) {
  const state = (rawState || {}) as RawGameState;
  const hands = state.hands || {};
  const nextHands: Record<string, Card[] | { count: number }> = {};

  for (const [seatKey, cards] of Object.entries(hands)) {
    const seatNumber = Number(seatKey);
    if (seatNumber === seat) {
      nextHands[seatKey] = cards;
    } else {
      nextHands[seatKey] = { count: Array.isArray(cards) ? cards.length : 0 };
    }
  }

  return {
    ...state,
    hands: nextHands,
  };
}

