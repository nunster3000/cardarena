"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const errorHandler_1 = require("../middleware/errorHandler");
const db_1 = require("../db");
const stripe_1 = require("../lib/stripe");
const router = (0, express_1.Router)();
router.get("/reconciliation", auth_1.authMiddleware, async (req, res, next) => {
    try {
        if (req.userRole !== "ADMIN") {
            throw new errorHandler_1.AppError("Unauthorized", 403);
        }
        // 🔹 1. Get Stripe balance
        const stripeBalance = await stripe_1.stripe.balance.retrieve();
        const available = stripeBalance.available.reduce((sum, b) => sum + b.amount, 0);
        const pending = stripeBalance.pending.reduce((sum, b) => sum + b.amount, 0);
        // 🔹 2. Get internal totals
        const platformWallet = await db_1.prisma.platformWallet.findFirst();
        const totalUserWallets = await db_1.prisma.wallet.aggregate({
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
            difference: available + pending -
                (Number(internalPlatformBalance) + Number(internalUserBalance)),
        });
    }
    catch (err) {
        next(err);
    }
});
router.get("/report", auth_1.authMiddleware, async (req, res, next) => {
    try {
        if (req.userRole !== "ADMIN") {
            throw new errorHandler_1.AppError("Unauthorized", 403);
        }
        // Total deposits (completed)
        const totalDeposits = await db_1.prisma.deposit.aggregate({
            where: { status: "COMPLETED" },
            _sum: { amount: true },
        });
        // Total withdrawals (completed)
        const totalWithdrawals = await db_1.prisma.withdrawal.aggregate({
            where: { status: "COMPLETED" },
            _sum: { amount: true },
        });
        // Platform revenue (tournament fees)
        const totalPlatformRevenue = await db_1.prisma.platformLedger.aggregate({
            _sum: { amount: true },
        });
        // Total user wallet balances
        const totalUserWallets = await db_1.prisma.wallet.aggregate({
            _sum: { balance: true },
        });
        // Completed tournaments
        const completedTournaments = await db_1.prisma.tournament.count({
            where: { status: "COMPLETED" },
        });
        // Total users
        const totalUsers = await db_1.prisma.user.count();
        res.json({
            deposits: totalDeposits._sum.amount || 0,
            withdrawals: totalWithdrawals._sum.amount || 0,
            platformRevenue: totalPlatformRevenue._sum.amount || 0,
            userWalletBalance: totalUserWallets._sum.balance || 0,
            completedTournaments,
            totalUsers,
        });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
