import { prisma } from "../db";
import { startTurnTimer } from "./turnManager";
import { GameStatus } from "@prisma/client";

export async function recoverActiveGames() {
  console.log("Recovering active games...");

  const games = await prisma.game.findMany({
    where: {
      status: GameStatus.ACTIVE,
    },
  });

  for (const game of games) {
    console.log(`Restoring game ${game.id}`);

    // Restart turn timer
    startTurnTimer(game.id);
  }

  console.log(`Recovered ${games.length} active games.`);
}
