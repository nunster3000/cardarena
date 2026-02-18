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
const router = (0, express_1.Router)();
const DAILY_DEPOSIT_LIMIT = 50000;
const MONTHLY_DEPOSIT_LIMIT = 250000;
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
        await db_1.prisma.$transaction(async (tx) => {
            await (0, risk_1.recordUserSignal)(tx, {
                userId: req.userId,
                type: "DEPOSIT",
                ip: req.ip,
                userAgent: req.get("user-agent"),
            });
            await (0, risk_1.evaluateMultiAccountRisk)(tx, req.userId, req.ip, req.get("user-agent"));
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
        res.json({
            clientSecret: paymentIntent.client_secret,
        });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
