"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../db");
const crypto_1 = require("crypto");
const auth_1 = require("../middleware/auth");
const errorHandler_1 = require("../middleware/errorHandler");
const router = (0, express_1.Router)();
const MIN_WITHDRAWAL = 2500; // $25 in cents
const WITHDRAWAL_FEE = 500; // $5 flat fee
const DAILY_LIMIT = 100000; // $1,000 in cents
const MONTHLY_LIMIT = 500000; // $5,000 in cents
router.post("/", auth_1.authMiddleware, async (req, res, next) => {
    try {
        const amount = Number(req.body.amount);
        if (!amount || isNaN(amount)) {
            throw new errorHandler_1.AppError("Invalid withdrawal amount", 400);
        }
        if (amount < MIN_WITHDRAWAL) {
            throw new errorHandler_1.AppError("Minimum withdrawal is $25", 400);
        }
        // Calculate daily total
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const dailyTotal = await db_1.prisma.withdrawal.aggregate({
            where: {
                userId: req.userId,
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
            throw new errorHandler_1.AppError("Daily withdrawal limit exceeded", 400);
        }
        // Max 2 withdrawals per day
        const withdrawalCountToday = await db_1.prisma.withdrawal.count({
            where: {
                userId: req.userId,
                createdAt: {
                    gte: startOfDay,
                },
                status: {
                    in: ["INITIATED", "UNDER_REVIEW", "APPROVED", "COMPLETED"],
                },
            },
        });
        if (withdrawalCountToday >= 2) {
            throw new errorHandler_1.AppError("Maximum 2 withdrawals allowed per day", 400);
        }
        // Calculate monthly total
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);
        const monthlyTotal = await db_1.prisma.withdrawal.aggregate({
            where: {
                userId: req.userId,
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
            throw new errorHandler_1.AppError("Monthly withdrawal limit exceeded", 400);
        }
        const wallet = await db_1.prisma.wallet.findUnique({
            where: { userId: req.userId },
        });
        if (!wallet) {
            throw new errorHandler_1.AppError("Wallet not found", 404);
        }
        const currentBalance = wallet.balance.toNumber();
        if (currentBalance < amount) {
            throw new errorHandler_1.AppError("Insufficient balance", 400);
        }
        const idempotencyKey = (0, crypto_1.randomUUID)();
        const netAmount = amount - WITHDRAWAL_FEE;
        if (netAmount <= 0) {
            throw new errorHandler_1.AppError("Withdrawal amount too small after fee", 400);
        }
        await db_1.prisma.$transaction(async (tx) => {
            const newBalance = wallet.balance.minus(amount);
            // 1️⃣ Update wallet balance
            await tx.wallet.update({
                where: { userId: req.userId },
                data: { balance: newBalance },
            });
            // 2️⃣ Create withdrawal record
            const withdrawal = await tx.withdrawal.create({
                data: {
                    userId: req.userId,
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
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
