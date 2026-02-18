"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const errorHandler_1 = require("../middleware/errorHandler");
const db_1 = require("../db");
const adminAudit_1 = require("../lib/adminAudit");
const router = (0, express_1.Router)();
function ensureAdmin(req) {
    if (req.userRole !== "ADMIN") {
        throw new errorHandler_1.AppError("Unauthorized", 403);
    }
}
router.get("/flags", auth_1.authMiddleware, async (req, res, next) => {
    try {
        ensureAdmin(req);
        const status = req.query.status || "OPEN";
        const severity = req.query.severity;
        const take = Math.min(Number(req.query.take) || 100, 250);
        const flags = await db_1.prisma.riskFlag.findMany({
            where: {
                status: status === "ALL" ? undefined : status,
                severity: severity,
            },
            include: {
                user: {
                    select: {
                        id: true,
                        email: true,
                        username: true,
                        riskScore: true,
                    },
                },
            },
            orderBy: { createdAt: "desc" },
            take,
        });
        res.json({ data: flags });
    }
    catch (err) {
        next(err);
    }
});
router.post("/flags/:id/resolve", auth_1.authMiddleware, async (req, res, next) => {
    try {
        ensureAdmin(req);
        const flag = await db_1.prisma.riskFlag.update({
            where: { id: req.params.id },
            data: {
                status: "RESOLVED",
                resolvedAt: new Date(),
            },
        });
        await (0, adminAudit_1.logAdminAction)(db_1.prisma, {
            adminUserId: req.userId,
            action: "RISK_FLAG_RESOLVE",
            targetType: "RISK_FLAG",
            targetId: flag.id,
            reason: "Manual admin resolve",
        });
        res.json({ success: true, flag });
    }
    catch (err) {
        next(err);
    }
});
router.get("/overview", auth_1.authMiddleware, async (req, res, next) => {
    try {
        ensureAdmin(req);
        const [activeGames, openFlags, highFlags, blockedUsers, heldWithdrawals, balances] = await Promise.all([
            db_1.prisma.game.count({
                where: { status: { in: ["WAITING", "ACTIVE", "PAUSED"] } },
            }),
            db_1.prisma.riskFlag.count({ where: { status: "OPEN" } }),
            db_1.prisma.riskFlag.count({
                where: { status: "OPEN", severity: "HIGH" },
            }),
            db_1.prisma.user.count({ where: { withdrawalBlocked: true } }),
            db_1.prisma.withdrawal.count({
                where: {
                    status: { in: ["INITIATED", "UNDER_REVIEW", "APPROVED"] },
                    adminHold: true,
                },
            }),
            db_1.prisma.wallet.aggregate({ _sum: { balance: true } }),
        ]);
        res.json({
            activeGames,
            openFlags,
            highFlags,
            blockedUsers,
            heldWithdrawals,
            totalUserWalletBalance: balances._sum.balance ?? 0,
        });
    }
    catch (err) {
        next(err);
    }
});
router.get("/withdrawals", auth_1.authMiddleware, async (req, res, next) => {
    try {
        ensureAdmin(req);
        const held = req.query.held;
        const status = req.query.status;
        const take = Math.min(Number(req.query.take) || 100, 250);
        const withdrawals = await db_1.prisma.withdrawal.findMany({
            where: {
                adminHold: held == null ? undefined : held === "true",
                status: status,
            },
            include: {
                user: {
                    select: {
                        id: true,
                        email: true,
                        username: true,
                        riskScore: true,
                    },
                },
            },
            orderBy: { createdAt: "desc" },
            take,
        });
        res.json({ data: withdrawals });
    }
    catch (err) {
        next(err);
    }
});
router.post("/withdrawals/:id/hold", auth_1.authMiddleware, async (req, res, next) => {
    try {
        ensureAdmin(req);
        const reason = String(req.body.reason || "Manual admin hold");
        const withdrawal = await db_1.prisma.withdrawal.update({
            where: { id: req.params.id },
            data: {
                adminHold: true,
                adminHoldReason: reason,
                adminHeldBy: req.userId,
                adminHoldAt: new Date(),
            },
        });
        await (0, adminAudit_1.logAdminAction)(db_1.prisma, {
            adminUserId: req.userId,
            action: "WITHDRAWAL_HOLD",
            targetType: "WITHDRAWAL",
            targetId: withdrawal.id,
            reason,
        });
        res.json({ success: true, withdrawal });
    }
    catch (err) {
        next(err);
    }
});
router.post("/withdrawals/:id/release", auth_1.authMiddleware, async (req, res, next) => {
    try {
        ensureAdmin(req);
        const withdrawal = await db_1.prisma.withdrawal.update({
            where: { id: req.params.id },
            data: {
                adminHold: false,
                adminHoldReason: null,
                adminHeldBy: null,
                adminHoldAt: null,
            },
        });
        await (0, adminAudit_1.logAdminAction)(db_1.prisma, {
            adminUserId: req.userId,
            action: "WITHDRAWAL_RELEASE",
            targetType: "WITHDRAWAL",
            targetId: withdrawal.id,
            reason: "Manual hold release",
        });
        res.json({ success: true, withdrawal });
    }
    catch (err) {
        next(err);
    }
});
router.post("/users/:id/block-withdrawals", auth_1.authMiddleware, async (req, res, next) => {
    try {
        ensureAdmin(req);
        const user = await db_1.prisma.user.update({
            where: { id: req.params.id },
            data: { withdrawalBlocked: true },
        });
        await (0, adminAudit_1.logAdminAction)(db_1.prisma, {
            adminUserId: req.userId,
            action: "USER_BLOCK_WITHDRAWALS",
            targetType: "USER",
            targetId: user.id,
            reason: "Admin withdrawal block",
        });
        res.json({ success: true, userId: user.id });
    }
    catch (err) {
        next(err);
    }
});
router.post("/users/:id/unblock-withdrawals", auth_1.authMiddleware, async (req, res, next) => {
    try {
        ensureAdmin(req);
        const user = await db_1.prisma.user.update({
            where: { id: req.params.id },
            data: { withdrawalBlocked: false },
        });
        await (0, adminAudit_1.logAdminAction)(db_1.prisma, {
            adminUserId: req.userId,
            action: "USER_UNBLOCK_WITHDRAWALS",
            targetType: "USER",
            targetId: user.id,
            reason: "Admin withdrawal unblock",
        });
        res.json({ success: true, userId: user.id });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
