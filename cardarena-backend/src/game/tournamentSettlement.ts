// src/game/tournamentSettlement.ts

import { prisma } from "../db";
import { Team } from "@prisma/client";
import { consumeLockedDepositAmount } from "../lib/depositHold";
import { evaluateWinRateAndCollusionRisk } from "../lib/risk";

export async function settleTournamentFromGame(gameId: string) {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: {
      tournament: {
        include: {
          entries: true,
        },
      },
    },
  });

  if (!game || !game.tournament) {
    throw new Error("Tournament not found for game");
  }

  const tournament = game.tournament;

  if (!game.winnerTeam) {
    throw new Error("Game has no winner");
  }

  if (tournament.settled) {
    console.log("Tournament already settled");
    return;
  }

  const winners = tournament.entries.filter(
    (e) => e.team === game.winnerTeam
  );
  const losers = tournament.entries.filter(
    (e) => e.team !== game.winnerTeam
  );

  const winnerShare = Math.floor(tournament.totalPrize / 2);

  await prisma.$transaction(async (tx) => {
    for (const entry of winners) {
      const wallet = await tx.wallet.findUnique({
        where: { userId: entry.userId },
      });

      if (!wallet) throw new Error("Wallet missing");

      const newBalance = wallet.balance.plus(winnerShare);

      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: newBalance },
      });

      await tx.ledger.create({
        data: {
          walletId: wallet.id,
          type: "WAGER_WIN",
          amount: winnerShare,
          balanceAfter: newBalance,
          reference: tournament.id,
        },
      });

      await tx.tournamentEntry.update({
        where: { id: entry.id },
        data: { isWinner: true },
      });
    }

    for (const entry of losers) {
      const wallet = await tx.wallet.findUnique({
        where: { userId: entry.userId },
      });

      if (!wallet) throw new Error("Wallet missing");

      await tx.ledger.create({
        data: {
          walletId: wallet.id,
          type: "WAGER_LOSS",
          amount: tournament.entryFee,
          balanceAfter: wallet.balance,
          reference: entry.id,
        },
      });

      await consumeLockedDepositAmount(tx, entry.userId, tournament.entryFee);

      await tx.tournamentEntry.update({
        where: { id: entry.id },
        data: { isWinner: false },
      });
    }

    await tx.tournament.update({
      where: { id: tournament.id },
      data: {
        settled: true,
        settledAt: new Date(),
        status: "COMPLETED",
      },
    });
  });

  await evaluateWinRateAndCollusionRisk(
    prisma,
    winners.map((w) => w.userId),
    losers.map((l) => l.userId)
  );

  console.log(`Tournament ${tournament.id} settled automatically.`);
}
