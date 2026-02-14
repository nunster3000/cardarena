"use strict";
// src/game/deck.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDeck = createDeck;
exports.shuffleDeck = shuffleDeck;
exports.dealCards = dealCards;
function createDeck() {
    const suits = ["S", "H", "D", "C"];
    const deck = [];
    for (const suit of suits) {
        for (let rank = 2; rank <= 14; rank++) {
            deck.push({ suit, rank });
        }
    }
    return deck;
}
// Fisher-Yates Shuffle
function shuffleDeck(deck) {
    const shuffled = [...deck];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}
// Deal 13 cards to 4 players
function dealCards(deck) {
    const hands = {
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
