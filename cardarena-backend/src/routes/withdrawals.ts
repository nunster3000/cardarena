import { Router } from "express";
import { prisma } from "../db";
import { randomUUID } from "crypto";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";

const router = Router();

const MIN_WITHDRAWAL = 2500; // $25 in cents
const WITHDRAWAL_FEE = 500;  // $5 flat fee
const DAILY_LIMIT = 100000; // $1,000 in cents
const MONTHLY_LIMIT = 500000; // $5,000 in cents

router.post("/", authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const amount = Number(req.body.amount);

    if (!amount || isNaN(amount)) {
      throw new AppError("Invalid withdrawal amount", 400);
    }

    if (amount < MIN_WITHDRAWAL) {
      throw new AppError("Minimum withdrawal is $25", 400);
    }

    // Calculate daily total
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const dailyTotal = await prisma.withdrawal.aggregate({
      where: {
        userId: req.userId!,
        status: {
          in: ["INITIATED", "UNDER_REVIEW", "APPROVED", "COMPLETED"],
        },
        createdAt: {
          gte: startOfDay,
        },
      },
      _sum: {
        amount: true,
      },
    });

    const dailyAmount = dailyTotal._sum.amount ?? 0;

    if (dailyAmount + amount > DAILY_LIMIT) {
      throw new AppError("Daily withdrawal limit exceeded", 400);
    }

    // Max 2 withdrawals per day
    const withdrawalCountToday = await prisma.withdrawal.count({
      where: {
        userId: req.userId!,
        createdAt: {
          gte: startOfDay,
        },
        status: {
          in: ["INITIATED", "UNDER_REVIEW", "APPROVED", "COMPLETED"],
        },
      },
    });

    if (withdrawalCountToday >= 2) {
      throw new AppError("Maximum 2 withdrawals allowed per day", 400);
    }

    // Calculate monthly total
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const monthlyTotal = await prisma.withdrawal.aggregate({
      where: {
        userId: req.userId!,
        status: {
          in: ["INITIATED", "UNDER_REVIEW", "APPROVED", "COMPLETED"],
        },
        createdAt: {
          gte: startOfMonth,
        },
      },
      _sum: {
        amount: true,
      },
    });

    const monthlyAmount = monthlyTotal._sum.amount ?? 0;

    if (monthlyAmount + amount > MONTHLY_LIMIT) {
      throw new AppError("Monthly withdrawal limit exceeded", 400);
    }

    const wallet = await prisma.wallet.findUnique({
      where: { userId: req.userId! },
    });

    if (!wallet) {
      throw new AppError("Wallet not found", 404);
    }

    const currentBalance = wallet.balance.toNumber();

    if (currentBalance < amount) {
      throw new AppError("Insufficient balance", 400);
    }

    const idempotencyKey = randomUUID();
    const netAmount = amount - WITHDRAWAL_FEE;

    if (netAmount <= 0) {
      throw new AppError("Withdrawal amount too small after fee", 400);
    }

    await prisma.$transaction(async (tx) => {
      const newBalance = wallet.balance.minus(amount);

      // 1️⃣ Update wallet balance
      await tx.wallet.update({
        where: { userId: req.userId! },
        data: { balance: newBalance },
      });

      // 2️⃣ Create withdrawal record
      const withdrawal = await tx.withdrawal.create({
        data: {
          userId: req.userId!,
          amount,
          fee: WITHDRAWAL_FEE,
          netAmount,
          status: "INITIATED",
          idempotencyKey,
          availableAt: new Date(Date.now() + 8 * 60 * 60 * 1000), // 8-hour hold
        },
      });

      // 3️⃣ Ledger entry (lock funds)
      await tx.ledger.create({
        data: {
          walletId: wallet.id,
          type: "WITHDRAW_LOCK",
          amount,
          balanceAfter: newBalance,
          reference: withdrawal.id, // important: unique reference
        },
      });
    });

    res.json({
      success: true,
      message: "Withdrawal initiated. Funds will be available after review period.",
    });

  } catch (err) {
    next(err);
  }
});

export default router;

