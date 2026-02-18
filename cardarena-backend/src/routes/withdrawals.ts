import { randomUUID } from "crypto";
import { Router } from "express";
import { prisma } from "../db";
import { getLockedDepositAmount } from "../lib/depositHold";
import {
  createRiskFlag,
  evaluateMultiAccountRisk,
  evaluateRapidDepositWithdrawRisk,
  evaluateWithdrawalVelocityRisk,
  recordUserSignal,
} from "../lib/risk";
import { AppError } from "../middleware/errorHandler";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { incMetric } from "../monitoring/metrics";
import { createUserNotification } from "../lib/userComms";

const router = Router();

const MIN_WITHDRAWAL = 2500;
const WITHDRAWAL_FEE = 500;
const DAILY_LIMIT = 50000;
const MONTHLY_LIMIT = 500000;

router.post("/", authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const amount = Number(req.body.amount);

    if (!amount || Number.isNaN(amount)) {
      throw new AppError("Invalid withdrawal amount", 400);
    }

    if (amount < MIN_WITHDRAWAL) {
      throw new AppError("Minimum withdrawal is $25", 400);
    }

    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: {
        id: true,
        withdrawalBlocked: true,
        isFrozen: true,
        stripeAccountId: true,
        stripeOnboarded: true,
      },
    });

    if (!user) throw new AppError("User not found", 404);
    if (user.isFrozen) {
      throw new AppError("Account is frozen. Withdrawals are disabled.", 403);
    }
    if (user.withdrawalBlocked) {
      throw new AppError("Withdrawals are blocked on this account", 403);
    }
    if (!user.stripeAccountId || !user.stripeOnboarded) {
      throw new AppError("Complete Stripe payout verification before withdrawing funds.", 400);
    }

    await prisma.$transaction(async (tx) => {
      await recordUserSignal(tx, {
        userId: req.userId!,
        type: "WITHDRAW",
        ip: req.ip,
        userAgent: req.get("user-agent"),
      });
      await evaluateMultiAccountRisk(tx, req.userId!, req.ip, req.get("user-agent"));
    });

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const dailyTotal = await prisma.withdrawal.aggregate({
      where: {
        userId: req.userId!,
        status: { in: ["INITIATED", "UNDER_REVIEW", "APPROVED", "COMPLETED"] },
        createdAt: { gte: startOfDay },
      },
      _sum: { amount: true },
    });
    const dailyAmount = dailyTotal._sum.amount ?? 0;
    if (dailyAmount + amount > DAILY_LIMIT) {
      await createRiskFlag(prisma, {
        userId: req.userId!,
        type: "WITHDRAWAL_VELOCITY",
        severity: "MEDIUM",
        score: 25,
        reason: "Daily withdrawal limit breached attempt.",
        details: { amount, dailyAmount },
      });
      throw new AppError("Daily withdrawal limit exceeded", 400);
    }

    const withdrawalCountToday = await prisma.withdrawal.count({
      where: {
        userId: req.userId!,
        createdAt: { gte: startOfDay },
        status: { in: ["INITIATED", "UNDER_REVIEW", "APPROVED", "COMPLETED"] },
      },
    });

    if (withdrawalCountToday >= 2) {
      await createRiskFlag(prisma, {
        userId: req.userId!,
        type: "WITHDRAWAL_VELOCITY",
        severity: "MEDIUM",
        score: 20,
        reason: "More than 2 withdrawals attempted in a day.",
        details: { withdrawalCountToday },
      });
      throw new AppError("Maximum 2 withdrawals allowed per day", 400);
    }

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const monthlyTotal = await prisma.withdrawal.aggregate({
      where: {
        userId: req.userId!,
        status: { in: ["INITIATED", "UNDER_REVIEW", "APPROVED", "COMPLETED"] },
        createdAt: { gte: startOfMonth },
      },
      _sum: { amount: true },
    });
    const monthlyAmount = monthlyTotal._sum.amount ?? 0;
    if (monthlyAmount + amount > MONTHLY_LIMIT) {
      await createRiskFlag(prisma, {
        userId: req.userId!,
        type: "WITHDRAWAL_VELOCITY",
        severity: "MEDIUM",
        score: 25,
        reason: "Monthly withdrawal limit breached attempt.",
        details: { amount, monthlyAmount },
      });
      throw new AppError("Monthly withdrawal limit exceeded", 400);
    }

    const wallet = await prisma.wallet.findUnique({
      where: { userId: req.userId! },
    });

    if (!wallet) throw new AppError("Wallet not found", 404);
    if (wallet.isFrozen) {
      throw new AppError("Wallet is frozen. Withdrawals are disabled.", 403);
    }

    const currentBalance = wallet.balance.toNumber();
    const lockedDepositAmount = await getLockedDepositAmount(prisma, req.userId!);
    const withdrawableBalance = Math.max(0, currentBalance - lockedDepositAmount);

    if (withdrawableBalance < amount) {
      await createRiskFlag(prisma, {
        userId: req.userId!,
        type: "RAPID_DEPOSIT_WITHDRAW",
        severity: "HIGH",
        score: 35,
        reason: "Attempted withdrawal exceeds withdrawable (unlocked) balance.",
        details: { amount, withdrawableBalance, lockedDepositAmount },
      });
      throw new AppError(
        `Insufficient withdrawable balance. Available now: $${(withdrawableBalance / 100).toFixed(2)}`,
        400
      );
    }

    const idempotencyKey = randomUUID();
    const netAmount = amount - WITHDRAWAL_FEE;
    if (netAmount <= 0) {
      throw new AppError("Withdrawal amount too small after fee", 400);
    }

    const openRiskFlags = await prisma.riskFlag.count({
      where: {
        userId: req.userId!,
        status: "OPEN",
        severity: { in: ["HIGH", "MEDIUM"] },
      },
    });
    const shouldAutoHold = openRiskFlags > 0;

    await prisma.$transaction(async (tx) => {
      const newBalance = wallet.balance.minus(amount);

      await tx.wallet.update({
        where: { userId: req.userId! },
        data: { balance: newBalance },
      });

      const withdrawal = await tx.withdrawal.create({
        data: {
          userId: req.userId!,
          amount,
          fee: WITHDRAWAL_FEE,
          netAmount,
          status: "INITIATED",
          idempotencyKey,
          availableAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
          adminHold: shouldAutoHold,
          adminHoldReason: shouldAutoHold ? "Auto-hold due to open risk flags" : null,
          adminHoldAt: shouldAutoHold ? new Date() : null,
          riskScore: shouldAutoHold ? 20 : 0,
          autoFlagged: shouldAutoHold,
        },
      });

      await tx.ledger.create({
        data: {
          walletId: wallet.id,
          type: "WITHDRAW_LOCK",
          amount,
          balanceAfter: newBalance,
          reference: withdrawal.id,
        },
      });

      await createUserNotification(tx as any, {
        userId: req.userId!,
        type: "USER_WITHDRAWAL_INITIATED",
        title: "Withdrawal Requested",
        message: `A withdrawal request for $${(amount / 100).toFixed(2)} has been submitted.`,
        payload: { amount, netAmount, autoHold: shouldAutoHold },
      });
    });

    await evaluateWithdrawalVelocityRisk(prisma, req.userId!);
    await evaluateRapidDepositWithdrawRisk(prisma, req.userId!);

    incMetric("withdrawals.initiated.total");

    res.json({
      success: true,
      message: shouldAutoHold
        ? "Withdrawal initiated and placed on risk hold for review."
        : "Withdrawal initiated. Funds will be available after review period.",
    });
  } catch (err) {
    next(err);
  }
});

export default router;
