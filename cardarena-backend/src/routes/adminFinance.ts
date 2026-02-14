import { Router } from "express";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { prisma } from "../db";
import { stripe } from "../lib/stripe";

const router = Router();

router.get("/reconciliation", authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    if (req.userRole !== "ADMIN") {
      throw new AppError("Unauthorized", 403);
    }

    // 🔹 1. Get Stripe balance
    const stripeBalance = await stripe.balance.retrieve();

    const available = stripeBalance.available.reduce(
      (sum, b) => sum + b.amount,
      0
    );

    const pending = stripeBalance.pending.reduce(
      (sum, b) => sum + b.amount,
      0
    );

    // 🔹 2. Get internal totals
    const platformWallet = await prisma.platformWallet.findFirst();

    const totalUserWallets = await prisma.wallet.aggregate({
      _sum: { balance: true },
    });

    const internalPlatformBalance = platformWallet?.balance || 0;
    const internalUserBalance = totalUserWallets._sum.balance || 0;

    res.json({
      stripe: {
        available,
        pending,
        total: available + pending,
      },
      internal: {
        platformBalance: internalPlatformBalance,
        userWalletBalance: internalUserBalance,
      },
      difference:
        available + pending -
        (Number(internalPlatformBalance) + Number(internalUserBalance)),
    });
  } catch (err) {
    next(err);
  }
});

router.get("/report", authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    if (req.userRole !== "ADMIN") {
      throw new AppError("Unauthorized", 403);
    }

    // Total deposits (completed)
    const totalDeposits = await prisma.deposit.aggregate({
      where: { status: "COMPLETED" },
      _sum: { amount: true },
    });

    // Total withdrawals (completed)
    const totalWithdrawals = await prisma.withdrawal.aggregate({
      where: { status: "COMPLETED" },
      _sum: { amount: true },
    });

    // Platform revenue (tournament fees)
    const totalPlatformRevenue = await prisma.platformLedger.aggregate({
      _sum: { amount: true },
    });

    // Total user wallet balances
    const totalUserWallets = await prisma.wallet.aggregate({
      _sum: { balance: true },
    });

    // Completed tournaments
    const completedTournaments = await prisma.tournament.count({
      where: { status: "COMPLETED" },
    });

    // Total users
    const totalUsers = await prisma.user.count();

    res.json({
      deposits: totalDeposits._sum.amount || 0,
      withdrawals: totalWithdrawals._sum.amount || 0,
      platformRevenue: totalPlatformRevenue._sum.amount || 0,
      userWalletBalance: totalUserWallets._sum.balance || 0,
      completedTournaments,
      totalUsers,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
