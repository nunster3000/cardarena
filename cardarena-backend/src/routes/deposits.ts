import crypto from "crypto";
import { Router } from "express";
import { prisma } from "../db";
import { AppError } from "../middleware/errorHandler";
import { stripe } from "../lib/stripe";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { evaluateMultiAccountRisk, recordUserSignal } from "../lib/risk";

const router = Router();
const DAILY_DEPOSIT_LIMIT = 50000;
const MONTHLY_DEPOSIT_LIMIT = 250000;

router.post("/", authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const { amount } = req.body;

    if (!amount || amount < 1000) {
      throw new AppError("Minimum deposit is $10.00", 400);
    }

    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      include: { wallet: true },
    });

    if (!user) throw new AppError("User not found", 404);
    if (user.isFrozen) {
      throw new AppError("Account is frozen. Deposits are disabled.", 403);
    }
    if (user.wallet?.isFrozen) {
      throw new AppError("Wallet is frozen. Deposits are disabled.", 403);
    }

    await prisma.$transaction(async (tx) => {
      await recordUserSignal(tx, {
        userId: req.userId!,
        type: "DEPOSIT",
        ip: req.ip,
        userAgent: req.get("user-agent"),
      });
      await evaluateMultiAccountRisk(tx, req.userId!, req.ip, req.get("user-agent"));
    });

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const dailyTotal = await prisma.deposit.aggregate({
      where: {
        userId: req.userId!,
        status: { in: ["PENDING", "COMPLETED"] },
        createdAt: { gte: startOfDay },
      },
      _sum: { amount: true },
    });

    const dailyAmount = dailyTotal._sum.amount ?? 0;
    if (dailyAmount + amount > DAILY_DEPOSIT_LIMIT) {
      throw new AppError("Daily deposit limit exceeded", 400);
    }

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const monthlyTotal = await prisma.deposit.aggregate({
      where: {
        userId: req.userId!,
        status: { in: ["PENDING", "COMPLETED"] },
        createdAt: { gte: startOfMonth },
      },
      _sum: { amount: true },
    });

    const monthlyAmount = monthlyTotal._sum.amount ?? 0;
    if (monthlyAmount + amount > MONTHLY_DEPOSIT_LIMIT) {
      throw new AppError("Monthly deposit limit exceeded", 400);
    }

    const deposit = await prisma.deposit.create({
      data: {
        userId: req.userId!,
        amount,
        status: "PENDING",
        idempotencyKey: crypto.randomUUID(),
      },
    });

    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: "usd",
      payment_method_types: ["card"],
      metadata: {
        userId: req.userId!,
        depositId: deposit.id,
        type: "wallet_deposit",
      },
    });

    await prisma.deposit.update({
      where: { id: deposit.id },
      data: { stripePaymentId: paymentIntent.id },
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
