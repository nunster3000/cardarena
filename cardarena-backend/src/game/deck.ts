// src/game/deck.ts

export type Suit = "SPADES" | "HEARTS" | "DIAMONDS" | "CLUBS";

export interface Card {
  suit: Suit;
  rank: number; // 2–14 (14 = Ace)
}

export function createDeck(): Card[] {
  const suits: Suit[] = ["SPADES", "HEARTS", "DIAMONDS", "CLUBS"];
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

// Deal 13 cards to 4 players, starting from a specific seat.
// For Spades, first card should go to dealer's left, and dealer gets last card.
export function dealCards(deck: Card[], firstSeat: number = 1) {
  const hands: Record<number, Card[]> = {
    1: [],
    2: [],
    3: [],
    4: [],
  };

  for (let i = 0; i < 52; i++) {
    const seat = ((firstSeat - 1 + i) % 4) + 1;
    hands[seat].push(deck[i]);
  }

  return hands;
}
