import crypto from "crypto";
import { Router } from "express";
import { prisma } from "../db";
import { AppError } from "../middleware/errorHandler";
import { stripe } from "../lib/stripe";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { evaluateMultiAccountRisk, recordUserSignal } from "../lib/risk";
import { createUserNotification } from "../lib/userComms";

const router = Router();
const DAILY_DEPOSIT_LIMIT = 50000;
const MONTHLY_DEPOSIT_LIMIT = 250000;
const frontendBaseUrl = (process.env.FRONTEND_BASE_URL || "http://localhost:3001").replace(/\/$/, "");

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

    await createUserNotification(prisma as any, {
      userId: req.userId!,
      type: "USER_DEPOSIT_INITIATED",
      title: "Deposit Initiated",
      message: `A deposit attempt for $${(amount / 100).toFixed(2)} was started.`,
      payload: { depositId: deposit.id, amount },
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/checkout", authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const amount = Number(req.body.amount);
    if (!amount || amount < 1000) {
      throw new AppError("Minimum deposit is $10.00", 400);
    }

    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      include: { wallet: true },
    });
    if (!user) throw new AppError("User not found", 404);
    if (user.isFrozen || user.wallet?.isFrozen) {
      throw new AppError("Account or wallet is frozen. Deposits are disabled.", 403);
    }

    const deposit = await prisma.deposit.create({
      data: {
        userId: req.userId!,
        amount,
        status: "PENDING",
        idempotencyKey: crypto.randomUUID(),
      },
    });

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: user.email,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: { name: "CardArena Wallet Deposit" },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
      success_url: `${frontendBaseUrl}/dashboard?deposit=success`,
      cancel_url: `${frontendBaseUrl}/dashboard?deposit=cancelled`,
      payment_intent_data: {
        metadata: {
          userId: req.userId!,
          depositId: deposit.id,
          type: "wallet_deposit",
        },
      },
      metadata: {
        userId: req.userId!,
        depositId: deposit.id,
        type: "wallet_deposit",
      },
    });

    await prisma.deposit.update({
      where: { id: deposit.id },
      data: { stripeSessionId: session.id },
    });

    await createUserNotification(prisma as any, {
      userId: req.userId!,
      type: "USER_DEPOSIT_INITIATED",
      title: "Deposit Initiated",
      message: `Checkout started for $${(amount / 100).toFixed(2)}.`,
      payload: { depositId: deposit.id, amount, checkoutSessionId: session.id },
    });

    res.json({ url: session.url });
  } catch (err) {
    next(err);
  }
});

export default router;
