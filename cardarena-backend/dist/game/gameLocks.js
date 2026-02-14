"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.withGameLock = withGameLock;
const gameLocks = new Set();
async function withGameLock(gameId, fn) {
    if (gameLocks.has(gameId)) {
        throw new Error("Game action already in progress");
    }
    gameLocks.add(gameId);
    try {
        return await fn();
    }
    finally {
        gameLocks.delete(gameId);
    }
}
