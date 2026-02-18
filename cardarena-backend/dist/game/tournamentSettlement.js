"use strict";
// src/game/tournamentSettlement.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.settleTournamentFromGame = settleTournamentFromGame;
const db_1 = require("../db");
const depositHold_1 = require("../lib/depositHold");
const risk_1 = require("../lib/risk");
async function settleTournamentFromGame(gameId) {
    const game = await db_1.prisma.game.findUnique({
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
    const winners = tournament.entries.filter((e) => e.team === game.winnerTeam);
    const losers = tournament.entries.filter((e) => e.team !== game.winnerTeam);
    const winnerShare = Math.floor(tournament.totalPrize / 2);
    await db_1.prisma.$transaction(async (tx) => {
        for (const entry of winners) {
            const wallet = await tx.wallet.findUnique({
                where: { userId: entry.userId },
            });
            if (!wallet)
                throw new Error("Wallet missing");
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
            if (!wallet)
                throw new Error("Wallet missing");
            await tx.ledger.create({
                data: {
                    walletId: wallet.id,
                    type: "WAGER_LOSS",
                    amount: tournament.entryFee,
                    balanceAfter: wallet.balance,
                    reference: entry.id,
                },
            });
            await (0, depositHold_1.consumeLockedDepositAmount)(tx, entry.userId, tournament.entryFee);
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
    await (0, risk_1.evaluateWinRateAndCollusionRisk)(db_1.prisma, winners.map((w) => w.userId), losers.map((l) => l.userId));
    console.log(`Tournament ${tournament.id} settled automatically.`);
}
