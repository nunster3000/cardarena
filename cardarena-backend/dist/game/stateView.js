"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.serializeGameStateForSeat = serializeGameStateForSeat;
function serializeGameStateForSeat(rawState, seat) {
    const state = (rawState || {});
    const hands = state.hands || {};
    const nextHands = {};
    for (const [seatKey, cards] of Object.entries(hands)) {
        const seatNumber = Number(seatKey);
        if (seatNumber === seat) {
            nextHands[seatKey] = cards;
        }
        else {
            nextHands[seatKey] = { count: Array.isArray(cards) ? cards.length : 0 };
        }
    }
    return {
        ...state,
        hands: nextHands,
    };
}
