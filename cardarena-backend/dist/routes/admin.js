"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const express_1 = require("express");
const db_1 = require("../db");
const errorHandler_1 = require("../middleware/errorHandler");
const auth_1 = require("../middleware/auth");
const settings_1 = require("../lib/settings");
const adminAudit_1 = require("../lib/adminAudit");
const userComms_1 = require("../lib/userComms");
const tournamentSettlement_1 = require("../game/tournamentSettlement");
const router = (0, express_1.Router)();
router.use(auth_1.authMiddleware, (0, auth_1.requireRole)("ADMIN"));
router.get("/users", async (_req, res, next) => {
    try {
        const users = await db_1.prisma.user.findMany({
            select: {
                id: true,
                email: true,
                username: true,
                role: true,
                signupStatus: true,
                signupRequestedAt: true,
                signupReviewedAt: true,
                signupReviewedBy: true,
                isFrozen: true,
                frozenAt: true,
                frozenReason: true,
                createdAt: true,
                wallet: {
                    select: {
                        balance: true,
                        isFrozen: true,
                        frozenAt: true,
                        frozenReason: true,
                    },
                },
            },
            orderBy: { createdAt: "desc" },
        });
        const [depositAgg, withdrawalAgg] = await Promise.all([
            db_1.prisma.deposit.groupBy({
                by: ["userId"],
                where: { status: "COMPLETED" },
                _sum: { amount: true },
            }),
            db_1.prisma.withdrawal.groupBy({
                by: ["userId"],
                where: { status: "COMPLETED" },
                _sum: { amount: true },
            }),
        ]);
        const depositsByUser = new Map(depositAgg.map((d) => [d.userId, d._sum.amount ?? 0]));
        const withdrawalsByUser = new Map(withdrawalAgg.map((w) => [w.userId, w._sum.amount ?? 0]));
        res.json({
            data: users.map((u) => ({
                ...u,
                totalDeposits: depositsByUser.get(u.id) ?? 0,
                totalWithdrawals: withdrawalsByUser.get(u.id) ?? 0,
            })),
        });
    }
    catch (err) {
        next(err);
    }
});
router.get("/reports/user-logs", async (req, res, next) => {
    try {
        const userId = String(req.query.userId || "").trim() || undefined;
        const take = Math.min(Number(req.query.take) || 50, 200);
        const users = await db_1.prisma.user.findMany({
            where: userId ? { id: userId } : undefined,
            orderBy: { createdAt: "desc" },
            take,
            select: {
                id: true,
                username: true,
                email: true,
                createdAt: true,
                termsAcceptedAt: true,
                privacyAcceptedAt: true,
                signupRequestedAt: true,
                signupReviewedAt: true,
            },
        });
        const ids = users.map((u) => u.id);
        const [signals, deposits, withdrawals] = await Promise.all([
            db_1.prisma.userSignal.findMany({
                where: { userId: { in: ids } },
                orderBy: { createdAt: "desc" },
                take: ids.length * 20 || 0,
                select: {
                    id: true,
                    userId: true,
                    type: true,
                    ip: true,
                    userAgent: true,
                    device: true,
                    createdAt: true,
                },
            }),
            db_1.prisma.deposit.findMany({
                where: { userId: { in: ids } },
                orderBy: { createdAt: "desc" },
                take: ids.length * 20 || 0,
                select: {
                    id: true,
                    userId: true,
                    amount: true,
                    status: true,
                    createdAt: true,
                },
            }),
            db_1.prisma.withdrawal.findMany({
                where: { userId: { in: ids } },
                orderBy: { createdAt: "desc" },
                take: ids.length * 20 || 0,
                select: {
                    id: true,
                    userId: true,
                    amount: true,
                    status: true,
                    createdAt: true,
                },
            }),
        ]);
        const byUserSignals = new Map();
        const byUserDeposits = new Map();
        const byUserWithdrawals = new Map();
        for (const s of signals) {
            byUserSignals.set(s.userId, [...(byUserSignals.get(s.userId) || []), s]);
        }
        for (const d of deposits) {
            byUserDeposits.set(d.userId, [...(byUserDeposits.get(d.userId) || []), d]);
        }
        for (const w of withdrawals) {
            byUserWithdrawals.set(w.userId, [...(byUserWithdrawals.get(w.userId) || []), w]);
        }
        res.json({
            data: users.map((u) => ({
                ...u,
                signals: byUserSignals.get(u.id) || [],
                deposits: byUserDeposits.get(u.id) || [],
                withdrawals: byUserWithdrawals.get(u.id) || [],
            })),
        });
    }
    catch (err) {
        next(err);
    }
});
router.get("/reports/gameplay", async (req, res, next) => {
    try {
        const userId = String(req.query.userId || "").trim() || undefined;
        const tournamentId = String(req.query.tournamentId || "").trim() || undefined;
        const take = Math.min(Number(req.query.take) || 200, 500);
        const logs = await db_1.prisma.gameplayLog.findMany({
            where: {
                userId,
                tournamentId,
            },
            include: {
                user: {
                    select: { id: true, username: true, email: true },
                },
            },
            orderBy: { createdAt: "desc" },
            take,
        });
        res.json({ data: logs });
    }
    catch (err) {
        next(err);
    }
});
router.get("/notifications", async (req, res, next) => {
    try {
        const status = String(req.query.status || "OPEN");
        const take = Math.min(Number(req.query.take) || 100, 300);
        const notifications = await db_1.prisma.adminNotification.findMany({
            where: status === "ALL" ? {} : { status },
            include: {
                user: {
                    select: { id: true, username: true, email: true, signupStatus: true },
                },
            },
            orderBy: { createdAt: "desc" },
            take,
        });
        res.json({ data: notifications });
    }
    catch (err) {
        next(err);
    }
});
router.post("/notifications/:id/read", async (req, res, next) => {
    try {
        const notification = await db_1.prisma.adminNotification.update({
            where: { id: req.params.id },
            data: {
                status: "READ",
                readAt: new Date(),
            },
        });
        res.json({ success: true, notification });
    }
    catch (err) {
        next(err);
    }
});
router.post("/users/:id/approve-signup", async (req, res, next) => {
    try {
        const reason = String(req.body.reason || "Signup approved");
        const user = await db_1.prisma.$transaction(async (tx) => {
            const updated = await tx.user.update({
                where: { id: req.params.id },
                data: {
                    signupStatus: client_1.SignupStatus.APPROVED,
                    signupReviewedAt: new Date(),
                    signupReviewedBy: req.userId,
                },
            });
            await tx.adminNotification.updateMany({
                where: { userId: req.params.id, type: "SIGNUP_REVIEW", status: "OPEN" },
                data: { status: "RESOLVED", actedAt: new Date(), readAt: new Date() },
            });
            await (0, userComms_1.createUserNotification)(tx, {
                userId: req.params.id,
                type: "USER_SIGNUP_APPROVED",
                title: "Signup Approved",
                message: "Your CardArena account has been approved. You can now login.",
            });
            await (0, adminAudit_1.logAdminAction)(tx, {
                adminUserId: req.userId,
                action: "USER_SIGNUP_APPROVED",
                targetType: "USER",
                targetId: updated.id,
                reason,
            });
            return updated;
        });
        (0, userComms_1.sendSignupDecisionEmail)({
            to: user.email,
            username: user.username,
            decision: "APPROVED",
        }).catch(() => undefined);
        res.json({ success: true, user });
    }
    catch (err) {
        next(err);
    }
});
router.post("/users/:id/waitlist-signup", async (req, res, next) => {
    try {
        const reason = String(req.body.reason || "Signup waitlisted");
        const user = await db_1.prisma.$transaction(async (tx) => {
            const updated = await tx.user.update({
                where: { id: req.params.id },
                data: {
                    signupStatus: client_1.SignupStatus.WAITLISTED,
                    signupReviewedAt: new Date(),
                    signupReviewedBy: req.userId,
                },
            });
            await tx.adminNotification.updateMany({
                where: { userId: req.params.id, type: "SIGNUP_REVIEW", status: "OPEN" },
                data: { status: "RESOLVED", actedAt: new Date(), readAt: new Date() },
            });
            await (0, userComms_1.createUserNotification)(tx, {
                userId: req.params.id,
                type: "USER_SIGNUP_WAITLISTED",
                title: "Signup Waitlisted",
                message: "Your CardArena account is currently waitlisted. We will notify you when access opens.",
            });
            await (0, adminAudit_1.logAdminAction)(tx, {
                adminUserId: req.userId,
                action: "USER_SIGNUP_WAITLISTED",
                targetType: "USER",
                targetId: updated.id,
                reason,
            });
            return updated;
        });
        (0, userComms_1.sendSignupDecisionEmail)({
            to: user.email,
            username: user.username,
            decision: "WAITLISTED",
        }).catch(() => undefined);
        res.json({ success: true, user });
    }
    catch (err) {
        next(err);
    }
});
router.post("/users/:id/role", async (req, res, next) => {
    try {
        const roleInput = String(req.body.role || "").toUpperCase();
        if (roleInput !== "ADMIN" && roleInput !== "USER") {
            throw new errorHandler_1.AppError("role must be ADMIN or USER", 400);
        }
        if (req.params.id === req.userId && roleInput === "USER") {
            throw new errorHandler_1.AppError("You cannot demote your own admin account", 400);
        }
        const role = roleInput;
        const user = await db_1.prisma.user.update({
            where: { id: req.params.id },
            data: { role },
            select: { id: true, email: true, username: true, role: true },
        });
        await (0, adminAudit_1.logAdminAction)(db_1.prisma, {
            adminUserId: req.userId,
            action: role === "ADMIN" ? "USER_PROMOTED_TO_ADMIN" : "ADMIN_DEMOTED_TO_USER",
            targetType: "USER",
            targetId: user.id,
            reason: `Set role to ${role}`,
        });
        res.json({ success: true, user });
    }
    catch (err) {
        next(err);
    }
});
router.post("/users/:id/freeze", async (req, res, next) => {
    try {
        const reason = String(req.body.reason || "Admin freeze");
        const user = await db_1.prisma.$transaction(async (tx) => {
            const updated = await tx.user.update({
                where: { id: req.params.id },
                data: {
                    isFrozen: true,
                    frozenAt: new Date(),
                    frozenReason: reason,
                },
                select: { id: true, username: true, email: true, isFrozen: true, frozenAt: true, frozenReason: true },
            });
            await (0, userComms_1.createUserNotification)(tx, {
                userId: updated.id,
                type: "USER_ACCOUNT_FROZEN",
                title: "Account Frozen",
                message: `Your account was frozen due to a CardArena Terms of Service violation. ${reason}`,
                payload: { reason },
            });
            await (0, adminAudit_1.logAdminAction)(tx, {
                adminUserId: req.userId,
                action: "USER_FREEZE",
                targetType: "USER",
                targetId: updated.id,
                reason,
            });
            return updated;
        });
        (0, userComms_1.sendAccountRestrictionEmail)({
            to: user.email,
            username: user.username,
            scope: "ACCOUNT",
            action: "FROZEN",
            reason,
        }).catch(() => undefined);
        res.json({ success: true, user });
    }
    catch (err) {
        next(err);
    }
});
router.post("/users/:id/unfreeze", async (req, res, next) => {
    try {
        const user = await db_1.prisma.$transaction(async (tx) => {
            const updated = await tx.user.update({
                where: { id: req.params.id },
                data: {
                    isFrozen: false,
                    frozenAt: null,
                    frozenReason: null,
                },
                select: { id: true, username: true, email: true, isFrozen: true },
            });
            await (0, userComms_1.createUserNotification)(tx, {
                userId: updated.id,
                type: "USER_ACCOUNT_UNFROZEN",
                title: "Account Unfrozen",
                message: "Your account freeze has been lifted. You may now use the platform.",
            });
            await (0, adminAudit_1.logAdminAction)(tx, {
                adminUserId: req.userId,
                action: "USER_UNFREEZE",
                targetType: "USER",
                targetId: updated.id,
                reason: "Admin unfreeze",
            });
            return updated;
        });
        (0, userComms_1.sendAccountRestrictionEmail)({
            to: user.email,
            username: user.username,
            scope: "ACCOUNT",
            action: "UNFROZEN",
        }).catch(() => undefined);
        res.json({ success: true, user });
    }
    catch (err) {
        next(err);
    }
});
router.get("/wallets/:userId/ledger", async (req, res, next) => {
    try {
        const take = Math.min(Number(req.query.take) || 200, 500);
        const wallet = await db_1.prisma.wallet.findUnique({
            where: { userId: req.params.userId },
        });
        if (!wallet)
            throw new errorHandler_1.AppError("Wallet not found", 404);
        const ledger = await db_1.prisma.ledger.findMany({
            where: { walletId: wallet.id },
            orderBy: { createdAt: "desc" },
            take,
        });
        res.json({ wallet, ledger });
    }
    catch (err) {
        next(err);
    }
});
router.get("/wallets/suspicious", async (_req, res, next) => {
    try {
        const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const candidates = await db_1.prisma.ledger.groupBy({
            by: ["walletId"],
            where: { createdAt: { gte: since24h } },
            _count: { _all: true },
            _sum: { amount: true },
        });
        const filteredCandidates = candidates.filter((c) => c._count._all >= 20);
        const wallets = await db_1.prisma.wallet.findMany({
            where: { id: { in: filteredCandidates.map((c) => c.walletId) } },
            include: {
                user: {
                    select: { id: true, email: true, username: true },
                },
            },
        });
        const byWallet = new Map(filteredCandidates.map((c) => [c.walletId, c]));
        res.json({
            data: wallets.map((w) => ({
                walletId: w.id,
                user: w.user,
                txCount24h: byWallet.get(w.id)?._count._all ?? 0,
                netAmount24h: byWallet.get(w.id)?._sum.amount ?? 0,
            })),
        });
    }
    catch (err) {
        next(err);
    }
});
router.post("/wallets/:userId/adjust", async (req, res, next) => {
    try {
        const amount = Number(req.body.amount);
        const reason = String(req.body.reason || "").trim();
        if (!amount || Number.isNaN(amount)) {
            throw new errorHandler_1.AppError("Amount must be a non-zero number (in cents)", 400);
        }
        if (!reason)
            throw new errorHandler_1.AppError("Reason is required", 400);
        const result = await db_1.prisma.$transaction(async (tx) => {
            const wallet = await tx.wallet.findUnique({
                where: { userId: req.params.userId },
            });
            if (!wallet)
                throw new errorHandler_1.AppError("Wallet not found", 404);
            const nextBalance = wallet.balance.plus(new client_1.Prisma.Decimal(amount));
            if (nextBalance.lt(0)) {
                throw new errorHandler_1.AppError("Manual debit exceeds wallet balance", 400);
            }
            const adjustment = await tx.walletAdjustment.create({
                data: {
                    walletId: wallet.id,
                    adminUserId: req.userId,
                    amount: new client_1.Prisma.Decimal(amount),
                    reason,
                },
            });
            await tx.wallet.update({
                where: { id: wallet.id },
                data: { balance: nextBalance },
            });
            const ledger = await tx.ledger.create({
                data: {
                    walletId: wallet.id,
                    type: amount > 0 ? "MANUAL_CREDIT" : "MANUAL_DEBIT",
                    amount: new client_1.Prisma.Decimal(Math.abs(amount)),
                    balanceAfter: nextBalance,
                    reference: adjustment.id,
                    adminUserId: req.userId,
                    reason,
                },
            });
            await tx.walletAdjustment.update({
                where: { id: adjustment.id },
                data: { ledgerId: ledger.id },
            });
            await (0, adminAudit_1.logAdminAction)(tx, {
                adminUserId: req.userId,
                action: amount > 0 ? "WALLET_MANUAL_CREDIT" : "WALLET_MANUAL_DEBIT",
                targetType: "WALLET",
                targetId: wallet.id,
                reason,
                details: {
                    amount,
                    ledgerId: ledger.id,
                    adjustmentId: adjustment.id,
                },
            });
            return { adjustment, ledger, nextBalance };
        });
        res.json({ success: true, ...result });
    }
    catch (err) {
        next(err);
    }
});
router.post("/wallets/:userId/freeze", async (req, res, next) => {
    try {
        const reason = String(req.body.reason || "Admin wallet freeze");
        const wallet = await db_1.prisma.$transaction(async (tx) => {
            const updated = await tx.wallet.update({
                where: { userId: req.params.userId },
                data: {
                    isFrozen: true,
                    frozenAt: new Date(),
                    frozenReason: reason,
                },
                include: {
                    user: { select: { id: true, email: true, username: true } },
                },
            });
            await (0, userComms_1.createUserNotification)(tx, {
                userId: updated.userId,
                type: "USER_WALLET_FROZEN",
                title: "Wallet Frozen",
                message: `Your wallet was frozen due to a CardArena Terms of Service violation. ${reason}`,
                payload: { reason },
            });
            await (0, adminAudit_1.logAdminAction)(tx, {
                adminUserId: req.userId,
                action: "WALLET_FREEZE",
                targetType: "WALLET",
                targetId: updated.id,
                reason,
            });
            return updated;
        });
        (0, userComms_1.sendAccountRestrictionEmail)({
            to: wallet.user.email,
            username: wallet.user.username,
            scope: "WALLET",
            action: "FROZEN",
            reason,
        }).catch(() => undefined);
        res.json({ success: true, wallet });
    }
    catch (err) {
        next(err);
    }
});
router.post("/wallets/:userId/unfreeze", async (req, res, next) => {
    try {
        const wallet = await db_1.prisma.$transaction(async (tx) => {
            const updated = await tx.wallet.update({
                where: { userId: req.params.userId },
                data: {
                    isFrozen: false,
                    frozenAt: null,
                    frozenReason: null,
                },
                include: {
                    user: { select: { id: true, email: true, username: true } },
                },
            });
            await (0, userComms_1.createUserNotification)(tx, {
                userId: updated.userId,
                type: "USER_WALLET_UNFROZEN",
                title: "Wallet Unfrozen",
                message: "Your wallet freeze has been lifted.",
            });
            await (0, adminAudit_1.logAdminAction)(tx, {
                adminUserId: req.userId,
                action: "WALLET_UNFREEZE",
                targetType: "WALLET",
                targetId: updated.id,
                reason: "Admin wallet unfreeze",
            });
            return updated;
        });
        (0, userComms_1.sendAccountRestrictionEmail)({
            to: wallet.user.email,
            username: wallet.user.username,
            scope: "WALLET",
            action: "UNFROZEN",
        }).catch(() => undefined);
        res.json({ success: true, wallet });
    }
    catch (err) {
        next(err);
    }
});
router.get("/games", async (req, res, next) => {
    try {
        const status = req.query.status || "ACTIVE";
        const where = status === "COMPLETED"
            ? { status: client_1.GameStatus.COMPLETED }
            : { status: { in: [client_1.GameStatus.WAITING, client_1.GameStatus.ACTIVE, client_1.GameStatus.PAUSED] } };
        const games = await db_1.prisma.game.findMany({
            where: where,
            include: {
                tournament: true,
                players: {
                    include: {
                        user: { select: { id: true, username: true, email: true } },
                    },
                },
            },
            orderBy: { createdAt: "desc" },
            take: 200,
        });
        res.json({
            data: games.map((g) => {
                const entries = g.tournament?.maxPlayers ?? 0;
                const potSize = (g.tournament?.entryFee ?? 0) * entries;
                return {
                    id: g.id,
                    status: g.status,
                    phase: g.phase,
                    createdAt: g.createdAt,
                    tournamentId: g.tournamentId,
                    potSize,
                    players: g.players.map((p) => ({
                        seat: p.seat,
                        isBot: p.isBot,
                        user: p.user,
                    })),
                };
            }),
        });
    }
    catch (err) {
        next(err);
    }
});
router.post("/games/:id/cancel", async (req, res, next) => {
    try {
        const reason = String(req.body.reason || "Emergency admin cancel");
        const game = await db_1.prisma.game.findUnique({
            where: { id: req.params.id },
            include: {
                tournament: {
                    include: { entries: true },
                },
            },
        });
        if (!game)
            throw new errorHandler_1.AppError("Game not found", 404);
        if (game.status === "COMPLETED" || game.status === "CANCELLED") {
            throw new errorHandler_1.AppError("Game cannot be cancelled in current state", 400);
        }
        if (!game.tournament)
            throw new errorHandler_1.AppError("Tournament not found", 404);
        await db_1.prisma.$transaction(async (tx) => {
            const tournament = game.tournament;
            if (!tournament.settled) {
                for (const entry of tournament.entries) {
                    const wallet = await tx.wallet.findUnique({
                        where: { userId: entry.userId },
                    });
                    if (!wallet)
                        continue;
                    const restoredBalance = wallet.balance.plus(tournament.entryFee);
                    await tx.wallet.update({
                        where: { id: wallet.id },
                        data: { balance: restoredBalance },
                    });
                    await tx.ledger.create({
                        data: {
                            walletId: wallet.id,
                            type: "WAGER_RELEASE",
                            amount: tournament.entryFee,
                            balanceAfter: restoredBalance,
                            reference: `${game.id}:cancel:${entry.id}`,
                            adminUserId: req.userId,
                            reason,
                        },
                    });
                }
            }
            await tx.game.update({
                where: { id: game.id },
                data: { status: "CANCELLED", phase: "GAME_COMPLETE" },
            });
            await tx.tournament.update({
                where: { id: game.tournamentId },
                data: { status: "CANCELLED", settled: true, settledAt: new Date() },
            });
            await (0, adminAudit_1.logAdminAction)(tx, {
                adminUserId: req.userId,
                action: "GAME_EMERGENCY_CANCEL",
                targetType: "GAME",
                targetId: game.id,
                reason,
                details: {
                    tournamentId: game.tournamentId,
                },
            });
        });
        res.json({ success: true, message: "Game cancelled and funds released." });
    }
    catch (err) {
        next(err);
    }
});
router.post("/games/:id/pause", async (req, res, next) => {
    try {
        const reason = String(req.body.reason || "Admin pause");
        const game = await db_1.prisma.game.update({
            where: { id: req.params.id },
            data: { status: "PAUSED" },
            select: { id: true, status: true, tournamentId: true },
        });
        await (0, adminAudit_1.logAdminAction)(db_1.prisma, {
            adminUserId: req.userId,
            action: "GAME_FORCE_PAUSE",
            targetType: "GAME",
            targetId: game.id,
            reason,
            details: { tournamentId: game.tournamentId },
        });
        res.json({ success: true, game });
    }
    catch (err) {
        next(err);
    }
});
router.post("/games/:id/resume", async (req, res, next) => {
    try {
        const reason = String(req.body.reason || "Admin resume");
        const game = await db_1.prisma.game.update({
            where: { id: req.params.id },
            data: { status: "ACTIVE" },
            select: { id: true, status: true, tournamentId: true },
        });
        await (0, adminAudit_1.logAdminAction)(db_1.prisma, {
            adminUserId: req.userId,
            action: "GAME_FORCE_RESUME",
            targetType: "GAME",
            targetId: game.id,
            reason,
            details: { tournamentId: game.tournamentId },
        });
        res.json({ success: true, game });
    }
    catch (err) {
        next(err);
    }
});
router.post("/games/:id/force-complete", async (req, res, next) => {
    try {
        const winningTeamInput = String(req.body.winningTeam || "").toUpperCase();
        const reason = String(req.body.reason || "Admin force complete");
        if (winningTeamInput !== "TEAM_A" && winningTeamInput !== "TEAM_B") {
            throw new errorHandler_1.AppError("winningTeam must be TEAM_A or TEAM_B", 400);
        }
        const game = await db_1.prisma.game.findUnique({
            where: { id: req.params.id },
            include: { tournament: true },
        });
        if (!game)
            throw new errorHandler_1.AppError("Game not found", 404);
        const updated = await db_1.prisma.game.update({
            where: { id: req.params.id },
            data: {
                status: "COMPLETED",
                phase: "GAME_COMPLETE",
                winnerTeam: winningTeamInput,
            },
            select: { id: true, tournamentId: true, winnerTeam: true, status: true, phase: true },
        });
        if (game.tournament && !game.tournament.settled) {
            await (0, tournamentSettlement_1.settleTournamentFromGame)(updated.id);
        }
        await (0, adminAudit_1.logAdminAction)(db_1.prisma, {
            adminUserId: req.userId,
            action: "GAME_FORCE_COMPLETE",
            targetType: "GAME",
            targetId: updated.id,
            reason,
            details: { winningTeam: winningTeamInput, tournamentId: updated.tournamentId },
        });
        res.json({ success: true, game: updated });
    }
    catch (err) {
        next(err);
    }
});
router.get("/settings/registrations", async (_req, res, next) => {
    try {
        const open = await (0, settings_1.getBooleanSetting)(db_1.prisma, "registrations_open", true);
        res.json({ registrationsOpen: open });
    }
    catch (err) {
        next(err);
    }
});
router.put("/settings/registrations", async (req, res, next) => {
    try {
        const open = Boolean(req.body.registrationsOpen);
        await (0, settings_1.setBooleanSetting)(db_1.prisma, "registrations_open", open);
        await (0, adminAudit_1.logAdminAction)(db_1.prisma, {
            adminUserId: req.userId,
            action: "SETTINGS_UPDATE_REGISTRATIONS",
            targetType: "APP_SETTING",
            targetId: "registrations_open",
            reason: open ? "Open registrations" : "Close registrations",
            details: { registrationsOpen: open },
        });
        res.json({ success: true, registrationsOpen: open });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
