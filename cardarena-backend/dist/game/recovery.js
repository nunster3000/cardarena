"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recoverActiveGames = recoverActiveGames;
const db_1 = require("../db");
const turnManager_1 = require("./turnManager");
const client_1 = require("@prisma/client");
async function recoverActiveGames() {
    console.log("Recovering active games...");
    const games = await db_1.prisma.game.findMany({
        where: {
            status: client_1.GameStatus.ACTIVE,
        },
    });
    for (const game of games) {
        console.log(`Restoring game ${game.id}`);
        // Restart turn timer
        (0, turnManager_1.startTurnTimer)(game.id);
    }
    console.log(`Recovered ${games.length} active games.`);
}
