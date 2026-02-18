import { Router } from "express";
import { prisma } from "../db";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { TournamentStatus, Team, Prisma } from "@prisma/client";
import { consumeLockedDepositAmount } from "../lib/depositHold";
import { evaluateWinRateAndCollusionRisk } from "../lib/risk";

const router = Router();

// Platform fee: 10% taken when table fills
const PLATFORM_FEE_BPS = 1000; // 10% in basis points

router.get("/", authMiddleware, async (_req: AuthRequest, res, next) => {
  try {
    const tournaments = await prisma.tournament.findMany({
      where: {
        status: { in: [TournamentStatus.OPEN, TournamentStatus.FULL] },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        entryFee: true,
        maxPlayers: true,
        status: true,
        totalPrize: true,
        createdAt: true,
      },
    });

    res.json({ data: tournaments });
  } catch (err) {
    next(err);
  }
});

// =============================
// ENTER TOURNAMENT
// =============================
router.post("/:id/enter", authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const tournamentId = req.params.id;
    const userId = req.userId!;

    const result = await prisma.$transaction(async (tx) => {
      const tournament = await tx.tournament.findUnique({
        where: { id: tournamentId },
        include: { entries: true },
      });

      if (!tournament) throw new AppError("Tournament not found", 404);
      if (tournament.status !== TournamentStatus.OPEN)
        throw new AppError("Tournament is not open", 400);

      if (tournament.entries.length >= tournament.maxPlayers)
        throw new AppError("Tournament is full", 400);

      const alreadyEntered = tournament.entries.some(
        (e) => e.userId === userId
      );
      if (alreadyEntered)
        throw new AppError("User already entered this tournament", 400);

      const wallet = await tx.wallet.findUnique({
        where: { userId },
      });
      if (!wallet) throw new AppError("Wallet not found", 404);
      if (wallet.isFrozen) {
        throw new AppError("Wallet is frozen. Cannot join games.", 403);
      }

      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { isFrozen: true },
      });
      if (user?.isFrozen) {
        throw new AppError("Account is frozen. Cannot join games.", 403);
      }

      const entryFee = tournament.entryFee;
      const walletBalance = wallet.balance.toNumber();

      if (walletBalance < entryFee)
        throw new AppError("Insufficient wallet balance", 400);

      const newBalance = wallet.balance.minus(entryFee);

      // Debit wallet
      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: newBalance },
      });

      // Determine team (2v2)
      const existingEntries = await tx.tournamentEntry.findMany({
        where: { tournamentId },
      });

      const team =
        existingEntries.filter((e) => e.team === Team.TEAM_A).length < 2
          ? Team.TEAM_A
          : Team.TEAM_B;

      const entry = await tx.tournamentEntry.create({
        data: {
          tournamentId,
          userId,
          team,
        },
      });

      // Ledger lock
      await tx.ledger.create({
        data: {
          walletId: wallet.id,
          type: "WAGER_LOCK",
          amount: entryFee,
          balanceAfter: newBalance,
          reference: entry.id,
        },
      });

      // Update prize pool
      const currentEntriesCount = existingEntries.length + 1;
      const grossPool = tournament.entryFee * currentEntriesCount;

      let status: TournamentStatus = tournament.status;
      let platformFee = tournament.platformFee;
      let totalPrize = grossPool;

      // If tournament fills → finalize platform fee
      if (currentEntriesCount === tournament.maxPlayers) {
        status = TournamentStatus.FULL;

        platformFee = Math.floor(
          (grossPool * PLATFORM_FEE_BPS) / 10000
        );

        totalPrize = grossPool - platformFee;

        // 🔹 Load platform wallet
        const platformWallet = await tx.platformWallet.findFirst();
        if (!platformWallet)
          throw new Error("Platform wallet not initialized");

        const feeDecimal = new Prisma.Decimal(platformFee);
        const newPlatformBalance =
          platformWallet.balance.plus(feeDecimal);

        // 🔹 Update platform wallet
        await tx.platformWallet.update({
          where: { id: platformWallet.id },
          data: { balance: newPlatformBalance },
        });

        // 🔹 Platform ledger entry
        await tx.platformLedger.create({
          data: {
            walletId: platformWallet.id,
            type: "TOURNAMENT_FEE",
            amount: feeDecimal,
            balanceAfter: newPlatformBalance,
            reference: tournamentId,
          },
        });
      }

      const updatedTournament = await tx.tournament.update({
        where: { id: tournamentId },
        data: {
          status,
          platformFee,
          totalPrize,
        },
      });

      return { entry, tournament: updatedTournament };
    });

    res.json({
      success: true,
      message: "Entered tournament successfully",
      tournament: result.tournament,
      entry: result.entry,
    });
  } catch (err) {
    next(err);
  }
});

// =============================
// SETTLE TOURNAMENT (ADMIN)
// =============================
router.post("/:id/settle", authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params;
    const { winningTeam } = req.body;

    if (req.userRole !== "ADMIN")
      throw new AppError("Unauthorized", 403);

    const tournament = await prisma.tournament.findUnique({
      where: { id },
      include: { entries: true },
    });

    if (!tournament)
      throw new AppError("Tournament not found", 404);

    if (tournament.status !== TournamentStatus.FULL)
      throw new AppError("Tournament not ready for settlement", 400);

    if (tournament.settled)
      throw new AppError("Tournament already settled", 400);

    if (![Team.TEAM_A, Team.TEAM_B].includes(winningTeam))
      throw new AppError("Invalid team", 400);

    const winners = tournament.entries.filter(
      (e) => e.team === winningTeam
    );

    const losers = tournament.entries.filter(
      (e) => e.team !== winningTeam
    );

    if (winners.length !== 2 || losers.length !== 2)
      throw new AppError("Invalid winner configuration", 400);

    const winnerShare = Math.floor(
      tournament.totalPrize / 2
    );

    await prisma.$transaction(async (tx) => {
      for (const entry of winners) {
        const wallet = await tx.wallet.findUnique({
          where: { userId: entry.userId },
        });

        if (!wallet) throw new Error("Wallet missing");

        const newBalance = wallet.balance.plus(winnerShare);

        await tx.wallet.update({
          where: { userId: entry.userId },
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

        await consumeLockedDepositAmount(
          tx,
          entry.userId,
          tournament.entryFee
        );

        await tx.tournamentEntry.update({
          where: { id: entry.id },
          data: { isWinner: false },
        });
      }

      await tx.tournament.update({
        where: { id },
        data: {
          settled: true,
          settledAt: new Date(),
          status: TournamentStatus.COMPLETED,
        },
      });
    });

    await evaluateWinRateAndCollusionRisk(
      prisma,
      winners.map((w) => w.userId),
      losers.map((l) => l.userId)
    );

    res.json({
      success: true,
      message: "Tournament settled successfully",
    });
  } catch (err) {
    next(err);
  }
});

// =============================
// CANCEL TOURNAMENT (ADMIN)
// =============================
router.post("/:id/cancel", authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    if (req.userRole !== "ADMIN") {
      throw new AppError("Unauthorized", 403);
    }

    const { id } = req.params;

    const tournament = await prisma.tournament.findUnique({
      where: { id },
      include: { entries: true },
    });

    if (!tournament) {
      throw new AppError("Tournament not found", 404);
    }

    if (tournament.settled) {
      throw new AppError("Cannot cancel settled tournament", 400);
    }

    await prisma.$transaction(async (tx) => {
      // Refund all entries
      for (const entry of tournament.entries) {
        const wallet = await tx.wallet.findUnique({
          where: { userId: entry.userId },
        });

        if (!wallet) throw new Error("Wallet missing");

        const restoredBalance = wallet.balance.plus(tournament.entryFee);

        await tx.wallet.update({
          where: { id: wallet.id },
          data: { balance: restoredBalance },
        });

        await tx.ledger.create({
          data: {
            walletId: wallet.id,
            type: "WAGER_RELEASE",
            amount: tournament.entryFee,
            balanceAfter: restoredBalance,
            reference: tournament.id,
          },
        });
      }

      // Reverse platform fee if taken
      if (tournament.platformFee > 0) {
        const platformWallet = await tx.platformWallet.findFirst();
        if (!platformWallet) throw new Error("Platform wallet missing");

        const newBalance = platformWallet.balance.minus(tournament.platformFee);

        await tx.platformWallet.update({
          where: { id: platformWallet.id },
          data: { balance: newBalance },
        });

        await tx.platformLedger.create({
          data: {
            walletId: platformWallet.id,
            type: "MANUAL_ADJUSTMENT",
            amount: -tournament.platformFee,
            balanceAfter: newBalance,
            reference: tournament.id,
          },
        });
      }

      // Mark tournament cancelled
      await tx.tournament.update({
        where: { id },
        data: {
          status: "CANCELLED",
        },
      });
    });

    res.json({ success: true, message: "Tournament cancelled and refunded" });
  } catch (err) {
    next(err);
  }
});

export default router;


