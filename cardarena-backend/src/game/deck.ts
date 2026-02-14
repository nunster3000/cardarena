// src/game/deck.ts

export type Suit = "S" | "H" | "D" | "C";

export interface Card {
  suit: Suit;
  rank: number; // 2–14 (14 = Ace)
}

export function createDeck(): Card[] {
  const suits: Suit[] = ["S", "H", "D", "C"];
  const deck: Card[] = [];

  for (const suit of suits) {
    for (let rank = 2; rank <= 14; rank++) {
      deck.push({ suit, rank });
    }
  }

  return deck;
}

// Fisher-Yates Shuffle
export function shuffleDeck(deck: Card[]): Card[] {
  const shuffled = [...deck];

  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled;
}

// Deal 13 cards to 4 players
export function dealCards(deck: Card[]) {
  const hands: Record<number, Card[]> = {
    1: [],
    2: [],
    3: [],
    4: [],
  };

  for (let i = 0; i < 52; i++) {
    const seat = (i % 4) + 1;
    hands[seat].push(deck[i]);
  }

  return hands;
}
