"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../db");
const auth_1 = require("../middleware/auth");
const errorHandler_1 = require("../middleware/errorHandler");
const client_1 = require("@prisma/client");
const depositHold_1 = require("../lib/depositHold");
const risk_1 = require("../lib/risk");
const requestMeta_1 = require("../lib/requestMeta");
const gameplayLog_1 = require("../lib/gameplayLog");
const router = (0, express_1.Router)();
// Platform fee: 10% taken when table fills
const PLATFORM_FEE_BPS = 1000; // 10% in basis points
router.get("/", auth_1.authMiddleware, async (_req, res, next) => {
    try {
        const tournaments = await db_1.prisma.tournament.findMany({
            where: {
                status: { in: [client_1.TournamentStatus.OPEN, client_1.TournamentStatus.FULL] },
            },
            orderBy: { createdAt: "desc" },
            take: 50,
            select: {
                id: true,
                entryFee: true,
                maxPlayers: true,
                status: true,
                totalPrize: true,
                createdAt: true,
            },
        });
        res.json({ data: tournaments });
    }
    catch (err) {
        next(err);
    }
});
// =============================
// ENTER TOURNAMENT
// =============================
router.post("/:id/enter", auth_1.authMiddleware, async (req, res, next) => {
    try {
        const tournamentId = req.params.id;
        const userId = req.userId;
        const meta = (0, requestMeta_1.getRequestMeta)(req);
        const result = await db_1.prisma.$transaction(async (tx) => {
            const tournament = await tx.tournament.findUnique({
                where: { id: tournamentId },
                include: { entries: true },
            });
            if (!tournament)
                throw new errorHandler_1.AppError("Tournament not found", 404);
            if (tournament.status !== client_1.TournamentStatus.OPEN)
                throw new errorHandler_1.AppError("Tournament is not open", 400);
            if (tournament.entries.length >= tournament.maxPlayers)
                throw new errorHandler_1.AppError("Tournament is full", 400);
            const alreadyEntered = tournament.entries.some((e) => e.userId === userId);
            if (alreadyEntered)
                throw new errorHandler_1.AppError("User already entered this tournament", 400);
            const wallet = await tx.wallet.findUnique({
                where: { userId },
            });
            if (!wallet)
                throw new errorHandler_1.AppError("Wallet not found", 404);
            if (wallet.isFrozen) {
                throw new errorHandler_1.AppError("Wallet is frozen. Cannot join games.", 403);
            }
            const user = await tx.user.findUnique({
                where: { id: userId },
                select: { isFrozen: true },
            });
            if (user?.isFrozen) {
                throw new errorHandler_1.AppError("Account is frozen. Cannot join games.", 403);
            }
            const entryFee = tournament.entryFee;
            const walletBalance = wallet.balance.toNumber();
            if (walletBalance < entryFee)
                throw new errorHandler_1.AppError("Insufficient wallet balance", 400);
            const newBalance = wallet.balance.minus(entryFee);
            // Debit wallet
            await tx.wallet.update({
                where: { id: wallet.id },
                data: { balance: newBalance },
            });
            // Determine team (2v2)
            const existingEntries = await tx.tournamentEntry.findMany({
                where: { tournamentId },
            });
            const team = existingEntries.filter((e) => e.team === client_1.Team.TEAM_A).length < 2
                ? client_1.Team.TEAM_A
                : client_1.Team.TEAM_B;
            const entry = await tx.tournamentEntry.create({
                data: {
                    tournamentId,
                    userId,
                    team,
                },
            });
            await (0, gameplayLog_1.recordGameplayLog)(tx, {
                userId,
                eventType: "TOURNAMENT_ENTRY",
                tournamentId,
                ip: meta.ip,
                userAgent: meta.userAgent,
                device: meta.device,
                metadata: {
                    entryFee,
                    team,
                    source: "http",
                },
            });
            // Ledger lock
            await tx.ledger.create({
                data: {
                    walletId: wallet.id,
                    type: "WAGER_LOCK",
                    amount: entryFee,
                    balanceAfter: newBalance,
                    reference: entry.id,
                },
            });
            // Update prize pool
            const currentEntriesCount = existingEntries.length + 1;
            const grossPool = tournament.entryFee * currentEntriesCount;
            let status = tournament.status;
            let platformFee = tournament.platformFee;
            let totalPrize = grossPool;
            // If tournament fills → finalize platform fee
            if (currentEntriesCount === tournament.maxPlayers) {
                status = client_1.TournamentStatus.FULL;
                platformFee = Math.floor((grossPool * PLATFORM_FEE_BPS) / 10000);
                totalPrize = grossPool - platformFee;
                // 🔹 Load platform wallet
                const platformWallet = await tx.platformWallet.findFirst();
                if (!platformWallet)
                    throw new Error("Platform wallet not initialized");
                const feeDecimal = new client_1.Prisma.Decimal(platformFee);
                const newPlatformBalance = platformWallet.balance.plus(feeDecimal);
                // 🔹 Update platform wallet
                await tx.platformWallet.update({
                    where: { id: platformWallet.id },
                    data: { balance: newPlatformBalance },
                });
                // 🔹 Platform ledger entry
                await tx.platformLedger.create({
                    data: {
                        walletId: platformWallet.id,
                        type: "TOURNAMENT_FEE",
                        amount: feeDecimal,
                        balanceAfter: newPlatformBalance,
                        reference: tournamentId,
                    },
                });
            }
            const updatedTournament = await tx.tournament.update({
                where: { id: tournamentId },
                data: {
                    status,
                    platformFee,
                    totalPrize,
                },
            });
            return { entry, tournament: updatedTournament };
        });
        res.json({
            success: true,
            message: "Entered tournament successfully",
            tournament: result.tournament,
            entry: result.entry,
        });
    }
    catch (err) {
        next(err);
    }
});
// =============================
// SETTLE TOURNAMENT (ADMIN)
// =============================
router.post("/:id/settle", auth_1.authMiddleware, async (req, res, next) => {
    try {
        const { id } = req.params;
        const { winningTeam } = req.body;
        if (req.userRole !== "ADMIN")
            throw new errorHandler_1.AppError("Unauthorized", 403);
        const tournament = await db_1.prisma.tournament.findUnique({
            where: { id },
            include: { entries: true },
        });
        if (!tournament)
            throw new errorHandler_1.AppError("Tournament not found", 404);
        if (tournament.status !== client_1.TournamentStatus.FULL)
            throw new errorHandler_1.AppError("Tournament not ready for settlement", 400);
        if (tournament.settled)
            throw new errorHandler_1.AppError("Tournament already settled", 400);
        if (![client_1.Team.TEAM_A, client_1.Team.TEAM_B].includes(winningTeam))
            throw new errorHandler_1.AppError("Invalid team", 400);
        const winners = tournament.entries.filter((e) => e.team === winningTeam);
        const losers = tournament.entries.filter((e) => e.team !== winningTeam);
        if (winners.length !== 2 || losers.length !== 2)
            throw new errorHandler_1.AppError("Invalid winner configuration", 400);
        const winnerShare = Math.floor(tournament.totalPrize / 2);
        await db_1.prisma.$transaction(async (tx) => {
            for (const entry of winners) {
                const wallet = await tx.wallet.findUnique({
                    where: { userId: entry.userId },
                });
                if (!wallet)
                    throw new Error("Wallet missing");
                const newBalance = wallet.balance.plus(winnerShare);
                await tx.wallet.update({
                    where: { userId: entry.userId },
                    data: { balance: newBalance },
                });
                await tx.ledger.create({
                    data: {
                        walletId: wallet.id,
                        type: "WAGER_WIN",
                        amount: winnerShare,
                        balanceAfter: newBalance,
                        reference: tournament.id,
                    },
                });
                await tx.tournamentEntry.update({
                    where: { id: entry.id },
                    data: { isWinner: true },
                });
            }
            for (const entry of losers) {
                const wallet = await tx.wallet.findUnique({
                    where: { userId: entry.userId },
                });
                if (!wallet)
                    throw new Error("Wallet missing");
                await tx.ledger.create({
                    data: {
                        walletId: wallet.id,
                        type: "WAGER_LOSS",
                        amount: tournament.entryFee,
                        balanceAfter: wallet.balance,
                        reference: entry.id,
                    },
                });
                await (0, depositHold_1.consumeLockedDepositAmount)(tx, entry.userId, tournament.entryFee);
                await tx.tournamentEntry.update({
                    where: { id: entry.id },
                    data: { isWinner: false },
                });
            }
            await tx.tournament.update({
                where: { id },
                data: {
                    settled: true,
                    settledAt: new Date(),
                    status: client_1.TournamentStatus.COMPLETED,
                },
            });
        });
        await (0, risk_1.evaluateWinRateAndCollusionRisk)(db_1.prisma, winners.map((w) => w.userId), losers.map((l) => l.userId));
        res.json({
            success: true,
            message: "Tournament settled successfully",
        });
    }
    catch (err) {
        next(err);
    }
});
// =============================
// CANCEL TOURNAMENT (ADMIN)
// =============================
router.post("/:id/cancel", auth_1.authMiddleware, async (req, res, next) => {
    try {
        if (req.userRole !== "ADMIN") {
            throw new errorHandler_1.AppError("Unauthorized", 403);
        }
        const { id } = req.params;
        const tournament = await db_1.prisma.tournament.findUnique({
            where: { id },
            include: { entries: true },
        });
        if (!tournament) {
            throw new errorHandler_1.AppError("Tournament not found", 404);
        }
        if (tournament.settled) {
            throw new errorHandler_1.AppError("Cannot cancel settled tournament", 400);
        }
        await db_1.prisma.$transaction(async (tx) => {
            // Refund all entries
            for (const entry of tournament.entries) {
                const wallet = await tx.wallet.findUnique({
                    where: { userId: entry.userId },
                });
                if (!wallet)
                    throw new Error("Wallet missing");
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
                        reference: tournament.id,
                    },
                });
            }
            // Reverse platform fee if taken
            if (tournament.platformFee > 0) {
                const platformWallet = await tx.platformWallet.findFirst();
                if (!platformWallet)
                    throw new Error("Platform wallet missing");
                const newBalance = platformWallet.balance.minus(tournament.platformFee);
                await tx.platformWallet.update({
                    where: { id: platformWallet.id },
                    data: { balance: newBalance },
                });
                await tx.platformLedger.create({
                    data: {
                        walletId: platformWallet.id,
                        type: "MANUAL_ADJUSTMENT",
                        amount: -tournament.platformFee,
                        balanceAfter: newBalance,
                        reference: tournament.id,
                    },
                });
            }
            // Mark tournament cancelled
            await tx.tournament.update({
                where: { id },
                data: {
                    status: "CANCELLED",
                },
            });
        });
        res.json({ success: true, message: "Tournament cancelled and refunded" });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
