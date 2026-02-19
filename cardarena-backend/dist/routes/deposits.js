"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const crypto_1 = __importDefault(require("crypto"));
const express_1 = require("express");
const db_1 = require("../db");
const errorHandler_1 = require("../middleware/errorHandler");
const stripe_1 = require("../lib/stripe");
const auth_1 = require("../middleware/auth");
const risk_1 = require("../lib/risk");
const userComms_1 = require("../lib/userComms");
const requestMeta_1 = require("../lib/requestMeta");
const router = (0, express_1.Router)();
const DAILY_DEPOSIT_LIMIT = 50000;
const MONTHLY_DEPOSIT_LIMIT = 250000;
const frontendBaseUrl = (process.env.FRONTEND_BASE_URL || "http://localhost:3001").replace(/\/$/, "");
router.post("/", auth_1.authMiddleware, async (req, res, next) => {
    try {
        const { amount } = req.body;
        if (!amount || amount < 1000) {
            throw new errorHandler_1.AppError("Minimum deposit is $10.00", 400);
        }
        const user = await db_1.prisma.user.findUnique({
            where: { id: req.userId },
            include: { wallet: true },
        });
        if (!user)
            throw new errorHandler_1.AppError("User not found", 404);
        if (user.isFrozen) {
            throw new errorHandler_1.AppError("Account is frozen. Deposits are disabled.", 403);
        }
        if (user.wallet?.isFrozen) {
            throw new errorHandler_1.AppError("Wallet is frozen. Deposits are disabled.", 403);
        }
        const meta = (0, requestMeta_1.getRequestMeta)(req);
        await db_1.prisma.$transaction(async (tx) => {
            await (0, risk_1.recordUserSignal)(tx, {
                userId: req.userId,
                type: "DEPOSIT",
                ip: meta.ip,
                userAgent: meta.userAgent,
                device: meta.device,
            });
            await (0, risk_1.evaluateMultiAccountRisk)(tx, req.userId, meta.ip, meta.userAgent);
        });
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const dailyTotal = await db_1.prisma.deposit.aggregate({
            where: {
                userId: req.userId,
                status: { in: ["PENDING", "COMPLETED"] },
                createdAt: { gte: startOfDay },
            },
            _sum: { amount: true },
        });
        const dailyAmount = dailyTotal._sum.amount ?? 0;
        if (dailyAmount + amount > DAILY_DEPOSIT_LIMIT) {
            throw new errorHandler_1.AppError("Daily deposit limit exceeded", 400);
        }
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);
        const monthlyTotal = await db_1.prisma.deposit.aggregate({
            where: {
                userId: req.userId,
                status: { in: ["PENDING", "COMPLETED"] },
                createdAt: { gte: startOfMonth },
            },
            _sum: { amount: true },
        });
        const monthlyAmount = monthlyTotal._sum.amount ?? 0;
        if (monthlyAmount + amount > MONTHLY_DEPOSIT_LIMIT) {
            throw new errorHandler_1.AppError("Monthly deposit limit exceeded", 400);
        }
        const deposit = await db_1.prisma.deposit.create({
            data: {
                userId: req.userId,
                amount,
                status: "PENDING",
                idempotencyKey: crypto_1.default.randomUUID(),
            },
        });
        const paymentIntent = await stripe_1.stripe.paymentIntents.create({
            amount,
            currency: "usd",
            payment_method_types: ["card"],
            metadata: {
                userId: req.userId,
                depositId: deposit.id,
                type: "wallet_deposit",
            },
        });
        await db_1.prisma.deposit.update({
            where: { id: deposit.id },
            data: { stripePaymentId: paymentIntent.id },
        });
        await (0, userComms_1.createUserNotification)(db_1.prisma, {
            userId: req.userId,
            type: "USER_DEPOSIT_INITIATED",
            title: "Deposit Initiated",
            message: `A deposit attempt for $${(amount / 100).toFixed(2)} was started.`,
            payload: { depositId: deposit.id, amount },
        });
        res.json({
            clientSecret: paymentIntent.client_secret,
        });
    }
    catch (err) {
        next(err);
    }
});
router.post("/checkout", auth_1.authMiddleware, async (req, res, next) => {
    try {
        const amount = Number(req.body.amount);
        if (!amount || amount < 1000) {
            throw new errorHandler_1.AppError("Minimum deposit is $10.00", 400);
        }
        const user = await db_1.prisma.user.findUnique({
            where: { id: req.userId },
            include: { wallet: true },
        });
        if (!user)
            throw new errorHandler_1.AppError("User not found", 404);
        if (user.isFrozen || user.wallet?.isFrozen) {
            throw new errorHandler_1.AppError("Account or wallet is frozen. Deposits are disabled.", 403);
        }
        const meta = (0, requestMeta_1.getRequestMeta)(req);
        await db_1.prisma.$transaction(async (tx) => {
            await (0, risk_1.recordUserSignal)(tx, {
                userId: req.userId,
                type: "DEPOSIT",
                ip: meta.ip,
                userAgent: meta.userAgent,
                device: meta.device,
            });
            await (0, risk_1.evaluateMultiAccountRisk)(tx, req.userId, meta.ip, meta.userAgent);
        });
        const deposit = await db_1.prisma.deposit.create({
            data: {
                userId: req.userId,
                amount,
                status: "PENDING",
                idempotencyKey: crypto_1.default.randomUUID(),
            },
        });
        const session = await stripe_1.stripe.checkout.sessions.create({
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
                    userId: req.userId,
                    depositId: deposit.id,
                    type: "wallet_deposit",
                },
            },
            metadata: {
                userId: req.userId,
                depositId: deposit.id,
                type: "wallet_deposit",
            },
        });
        await db_1.prisma.deposit.update({
            where: { id: deposit.id },
            data: { stripeSessionId: session.id },
        });
        await (0, userComms_1.createUserNotification)(db_1.prisma, {
            userId: req.userId,
            type: "USER_DEPOSIT_INITIATED",
            title: "Deposit Initiated",
            message: `Checkout started for $${(amount / 100).toFixed(2)}.`,
            payload: { depositId: deposit.id, amount, checkoutSessionId: session.id },
        });
        res.json({ url: session.url });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
