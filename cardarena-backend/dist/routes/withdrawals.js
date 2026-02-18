"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const crypto_1 = require("crypto");
const express_1 = require("express");
const db_1 = require("../db");
const depositHold_1 = require("../lib/depositHold");
const risk_1 = require("../lib/risk");
const errorHandler_1 = require("../middleware/errorHandler");
const auth_1 = require("../middleware/auth");
const metrics_1 = require("../monitoring/metrics");
const router = (0, express_1.Router)();
const MIN_WITHDRAWAL = 2500;
const WITHDRAWAL_FEE = 500;
const DAILY_LIMIT = 100000;
const MONTHLY_LIMIT = 500000;
router.post("/", auth_1.authMiddleware, async (req, res, next) => {
    try {
        const amount = Number(req.body.amount);
        if (!amount || Number.isNaN(amount)) {
            throw new errorHandler_1.AppError("Invalid withdrawal amount", 400);
        }
        if (amount < MIN_WITHDRAWAL) {
            throw new errorHandler_1.AppError("Minimum withdrawal is $25", 400);
        }
        const user = await db_1.prisma.user.findUnique({
            where: { id: req.userId },
            select: { id: true, withdrawalBlocked: true, isFrozen: true },
        });
        if (!user)
            throw new errorHandler_1.AppError("User not found", 404);
        if (user.isFrozen) {
            throw new errorHandler_1.AppError("Account is frozen. Withdrawals are disabled.", 403);
        }
        if (user.withdrawalBlocked) {
            throw new errorHandler_1.AppError("Withdrawals are blocked on this account", 403);
        }
        await db_1.prisma.$transaction(async (tx) => {
            await (0, risk_1.recordUserSignal)(tx, {
                userId: req.userId,
                type: "WITHDRAW",
                ip: req.ip,
                userAgent: req.get("user-agent"),
            });
            await (0, risk_1.evaluateMultiAccountRisk)(tx, req.userId, req.ip, req.get("user-agent"));
        });
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const dailyTotal = await db_1.prisma.withdrawal.aggregate({
            where: {
                userId: req.userId,
                status: { in: ["INITIATED", "UNDER_REVIEW", "APPROVED", "COMPLETED"] },
                createdAt: { gte: startOfDay },
            },
            _sum: { amount: true },
        });
        const dailyAmount = dailyTotal._sum.amount ?? 0;
        if (dailyAmount + amount > DAILY_LIMIT) {
            await (0, risk_1.createRiskFlag)(db_1.prisma, {
                userId: req.userId,
                type: "WITHDRAWAL_VELOCITY",
                severity: "MEDIUM",
                score: 25,
                reason: "Daily withdrawal limit breached attempt.",
                details: { amount, dailyAmount },
            });
            throw new errorHandler_1.AppError("Daily withdrawal limit exceeded", 400);
        }
        const withdrawalCountToday = await db_1.prisma.withdrawal.count({
            where: {
                userId: req.userId,
                createdAt: { gte: startOfDay },
                status: { in: ["INITIATED", "UNDER_REVIEW", "APPROVED", "COMPLETED"] },
            },
        });
        if (withdrawalCountToday >= 2) {
            await (0, risk_1.createRiskFlag)(db_1.prisma, {
                userId: req.userId,
                type: "WITHDRAWAL_VELOCITY",
                severity: "MEDIUM",
                score: 20,
                reason: "More than 2 withdrawals attempted in a day.",
                details: { withdrawalCountToday },
            });
            throw new errorHandler_1.AppError("Maximum 2 withdrawals allowed per day", 400);
        }
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);
        const monthlyTotal = await db_1.prisma.withdrawal.aggregate({
            where: {
                userId: req.userId,
                status: { in: ["INITIATED", "UNDER_REVIEW", "APPROVED", "COMPLETED"] },
                createdAt: { gte: startOfMonth },
            },
            _sum: { amount: true },
        });
        const monthlyAmount = monthlyTotal._sum.amount ?? 0;
        if (monthlyAmount + amount > MONTHLY_LIMIT) {
            await (0, risk_1.createRiskFlag)(db_1.prisma, {
                userId: req.userId,
                type: "WITHDRAWAL_VELOCITY",
                severity: "MEDIUM",
                score: 25,
                reason: "Monthly withdrawal limit breached attempt.",
                details: { amount, monthlyAmount },
            });
            throw new errorHandler_1.AppError("Monthly withdrawal limit exceeded", 400);
        }
        const wallet = await db_1.prisma.wallet.findUnique({
            where: { userId: req.userId },
        });
        if (!wallet)
            throw new errorHandler_1.AppError("Wallet not found", 404);
        if (wallet.isFrozen) {
            throw new errorHandler_1.AppError("Wallet is frozen. Withdrawals are disabled.", 403);
        }
        const currentBalance = wallet.balance.toNumber();
        const lockedDepositAmount = await (0, depositHold_1.getLockedDepositAmount)(db_1.prisma, req.userId);
        const withdrawableBalance = Math.max(0, currentBalance - lockedDepositAmount);
        if (withdrawableBalance < amount) {
            await (0, risk_1.createRiskFlag)(db_1.prisma, {
                userId: req.userId,
                type: "RAPID_DEPOSIT_WITHDRAW",
                severity: "HIGH",
                score: 35,
                reason: "Attempted withdrawal exceeds withdrawable (unlocked) balance.",
                details: { amount, withdrawableBalance, lockedDepositAmount },
            });
            throw new errorHandler_1.AppError(`Insufficient withdrawable balance. Available now: $${(withdrawableBalance / 100).toFixed(2)}`, 400);
        }
        const idempotencyKey = (0, crypto_1.randomUUID)();
        const netAmount = amount - WITHDRAWAL_FEE;
        if (netAmount <= 0) {
            throw new errorHandler_1.AppError("Withdrawal amount too small after fee", 400);
        }
        const openRiskFlags = await db_1.prisma.riskFlag.count({
            where: {
                userId: req.userId,
                status: "OPEN",
                severity: { in: ["HIGH", "MEDIUM"] },
            },
        });
        const shouldAutoHold = openRiskFlags > 0;
        await db_1.prisma.$transaction(async (tx) => {
            const newBalance = wallet.balance.minus(amount);
            await tx.wallet.update({
                where: { userId: req.userId },
                data: { balance: newBalance },
            });
            const withdrawal = await tx.withdrawal.create({
                data: {
                    userId: req.userId,
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
        });
        await (0, risk_1.evaluateWithdrawalVelocityRisk)(db_1.prisma, req.userId);
        await (0, risk_1.evaluateRapidDepositWithdrawRisk)(db_1.prisma, req.userId);
        (0, metrics_1.incMetric)("withdrawals.initiated.total");
        res.json({
            success: true,
            message: shouldAutoHold
                ? "Withdrawal initiated and placed on risk hold for review."
                : "Withdrawal initiated. Funds will be available after review period.",
        });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
