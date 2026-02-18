import { GameStatus, Prisma, Role, SignupStatus } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../db";
import { AppError } from "../middleware/errorHandler";
import { authMiddleware, AuthRequest, requireRole } from "../middleware/auth";
import { getBooleanSetting, setBooleanSetting } from "../lib/settings";
import { logAdminAction } from "../lib/adminAudit";

const router = Router();

router.use(authMiddleware, requireRole("ADMIN"));

router.get("/users", async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({
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
      prisma.deposit.groupBy({
        by: ["userId"],
        where: { status: "COMPLETED" },
        _sum: { amount: true },
      }),
      prisma.withdrawal.groupBy({
        by: ["userId"],
        where: { status: "COMPLETED" },
        _sum: { amount: true },
      }),
    ]);

    const depositsByUser = new Map(
      depositAgg.map((d) => [d.userId, d._sum.amount ?? 0])
    );
    const withdrawalsByUser = new Map(
      withdrawalAgg.map((w) => [w.userId, w._sum.amount ?? 0])
    );

    res.json({
      data: users.map((u) => ({
        ...u,
        totalDeposits: depositsByUser.get(u.id) ?? 0,
        totalWithdrawals: withdrawalsByUser.get(u.id) ?? 0,
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.get("/notifications", async (req, res, next) => {
  try {
    const status = String(req.query.status || "OPEN");
    const take = Math.min(Number(req.query.take) || 100, 300);
    const notifications = await prisma.adminNotification.findMany({
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
  } catch (err) {
    next(err);
  }
});

router.post("/notifications/:id/read", async (req, res, next) => {
  try {
    const notification = await prisma.adminNotification.update({
      where: { id: req.params.id },
      data: {
        status: "READ",
        readAt: new Date(),
      },
    });
    res.json({ success: true, notification });
  } catch (err) {
    next(err);
  }
});

router.post("/users/:id/approve-signup", async (req: AuthRequest, res, next) => {
  try {
    const reason = String(req.body.reason || "Signup approved");
    const user = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: req.params.id },
        data: {
          signupStatus: SignupStatus.APPROVED,
          signupReviewedAt: new Date(),
          signupReviewedBy: req.userId!,
        },
      });

      await tx.adminNotification.updateMany({
        where: { userId: req.params.id, type: "SIGNUP_REVIEW", status: "OPEN" },
        data: { status: "RESOLVED", actedAt: new Date(), readAt: new Date() },
      });

      await logAdminAction(tx, {
        adminUserId: req.userId!,
        action: "USER_SIGNUP_APPROVED",
        targetType: "USER",
        targetId: updated.id,
        reason,
      });
      return updated;
    });

    res.json({ success: true, user });
  } catch (err) {
    next(err);
  }
});

router.post("/users/:id/waitlist-signup", async (req: AuthRequest, res, next) => {
  try {
    const reason = String(req.body.reason || "Signup waitlisted");
    const user = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: req.params.id },
        data: {
          signupStatus: SignupStatus.WAITLISTED,
          signupReviewedAt: new Date(),
          signupReviewedBy: req.userId!,
        },
      });

      await tx.adminNotification.updateMany({
        where: { userId: req.params.id, type: "SIGNUP_REVIEW", status: "OPEN" },
        data: { status: "RESOLVED", actedAt: new Date(), readAt: new Date() },
      });

      await logAdminAction(tx, {
        adminUserId: req.userId!,
        action: "USER_SIGNUP_WAITLISTED",
        targetType: "USER",
        targetId: updated.id,
        reason,
      });
      return updated;
    });

    res.json({ success: true, user });
  } catch (err) {
    next(err);
  }
});

router.post("/users/:id/role", async (req: AuthRequest, res, next) => {
  try {
    const roleInput = String(req.body.role || "").toUpperCase();
    if (roleInput !== "ADMIN" && roleInput !== "USER") {
      throw new AppError("role must be ADMIN or USER", 400);
    }

    if (req.params.id === req.userId && roleInput === "USER") {
      throw new AppError("You cannot demote your own admin account", 400);
    }

    const role = roleInput as Role;
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { role },
      select: { id: true, email: true, username: true, role: true },
    });

    await logAdminAction(prisma, {
      adminUserId: req.userId!,
      action: role === "ADMIN" ? "USER_PROMOTED_TO_ADMIN" : "ADMIN_DEMOTED_TO_USER",
      targetType: "USER",
      targetId: user.id,
      reason: `Set role to ${role}`,
    });

    res.json({ success: true, user });
  } catch (err) {
    next(err);
  }
});

router.post("/users/:id/freeze", async (req: AuthRequest, res, next) => {
  try {
    const reason = String(req.body.reason || "Admin freeze");
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: {
        isFrozen: true,
        frozenAt: new Date(),
        frozenReason: reason,
      },
      select: { id: true, isFrozen: true, frozenAt: true, frozenReason: true },
    });
    await logAdminAction(prisma, {
      adminUserId: req.userId!,
      action: "USER_FREEZE",
      targetType: "USER",
      targetId: user.id,
      reason,
    });
    res.json({ success: true, user });
  } catch (err) {
    next(err);
  }
});

router.post("/users/:id/unfreeze", async (req, res, next) => {
  try {
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: {
        isFrozen: false,
        frozenAt: null,
        frozenReason: null,
      },
      select: { id: true, isFrozen: true },
    });
    await logAdminAction(prisma, {
      adminUserId: (req as AuthRequest).userId!,
      action: "USER_UNFREEZE",
      targetType: "USER",
      targetId: user.id,
      reason: "Admin unfreeze",
    });
    res.json({ success: true, user });
  } catch (err) {
    next(err);
  }
});

router.get("/wallets/:userId/ledger", async (req, res, next) => {
  try {
    const take = Math.min(Number(req.query.take) || 200, 500);
    const wallet = await prisma.wallet.findUnique({
      where: { userId: req.params.userId },
    });
    if (!wallet) throw new AppError("Wallet not found", 404);

    const ledger = await prisma.ledger.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: "desc" },
      take,
    });

    res.json({ wallet, ledger });
  } catch (err) {
    next(err);
  }
});

router.get("/wallets/suspicious", async (_req, res, next) => {
  try {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const candidates = await prisma.ledger.groupBy({
      by: ["walletId"],
      where: { createdAt: { gte: since24h } },
      _count: { _all: true },
      _sum: { amount: true },
    });

    const filteredCandidates = candidates.filter((c) => c._count._all >= 20);

    const wallets = await prisma.wallet.findMany({
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
  } catch (err) {
    next(err);
  }
});

router.post("/wallets/:userId/adjust", async (req: AuthRequest, res, next) => {
  try {
    const amount = Number(req.body.amount);
    const reason = String(req.body.reason || "").trim();

    if (!amount || Number.isNaN(amount)) {
      throw new AppError("Amount must be a non-zero number (in cents)", 400);
    }
    if (!reason) throw new AppError("Reason is required", 400);

    const result = await prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({
        where: { userId: req.params.userId },
      });
      if (!wallet) throw new AppError("Wallet not found", 404);

      const nextBalance = wallet.balance.plus(new Prisma.Decimal(amount));
      if (nextBalance.lt(0)) {
        throw new AppError("Manual debit exceeds wallet balance", 400);
      }

      const adjustment = await tx.walletAdjustment.create({
        data: {
          walletId: wallet.id,
          adminUserId: req.userId!,
          amount: new Prisma.Decimal(amount),
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
          amount: new Prisma.Decimal(Math.abs(amount)),
          balanceAfter: nextBalance,
          reference: adjustment.id,
          adminUserId: req.userId!,
          reason,
        },
      });

      await tx.walletAdjustment.update({
        where: { id: adjustment.id },
        data: { ledgerId: ledger.id },
      });

      await logAdminAction(tx, {
        adminUserId: req.userId!,
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
  } catch (err) {
    next(err);
  }
});

router.post("/wallets/:userId/freeze", async (req, res, next) => {
  try {
    const reason = String(req.body.reason || "Admin wallet freeze");
    const wallet = await prisma.wallet.update({
      where: { userId: req.params.userId },
      data: {
        isFrozen: true,
        frozenAt: new Date(),
        frozenReason: reason,
      },
    });
    await logAdminAction(prisma, {
      adminUserId: (req as AuthRequest).userId!,
      action: "WALLET_FREEZE",
      targetType: "WALLET",
      targetId: wallet.id,
      reason,
    });
    res.json({ success: true, wallet });
  } catch (err) {
    next(err);
  }
});

router.post("/wallets/:userId/unfreeze", async (req, res, next) => {
  try {
    const wallet = await prisma.wallet.update({
      where: { userId: req.params.userId },
      data: {
        isFrozen: false,
        frozenAt: null,
        frozenReason: null,
      },
    });
    await logAdminAction(prisma, {
      adminUserId: (req as AuthRequest).userId!,
      action: "WALLET_UNFREEZE",
      targetType: "WALLET",
      targetId: wallet.id,
      reason: "Admin wallet unfreeze",
    });
    res.json({ success: true, wallet });
  } catch (err) {
    next(err);
  }
});

router.get("/games", async (req, res, next) => {
  try {
    const status = (req.query.status as string) || "ACTIVE";
    const where: Prisma.GameWhereInput =
      status === "COMPLETED"
        ? { status: GameStatus.COMPLETED }
        : { status: { in: [GameStatus.WAITING, GameStatus.ACTIVE, GameStatus.PAUSED] } };

    const games = await prisma.game.findMany({
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
  } catch (err) {
    next(err);
  }
});

router.post("/games/:id/cancel", async (req: AuthRequest, res, next) => {
  try {
    const reason = String(req.body.reason || "Emergency admin cancel");

    const game = await prisma.game.findUnique({
      where: { id: req.params.id },
      include: {
        tournament: {
          include: { entries: true },
        },
      },
    });

    if (!game) throw new AppError("Game not found", 404);
    if (game.status === "COMPLETED" || game.status === "CANCELLED") {
      throw new AppError("Game cannot be cancelled in current state", 400);
    }
    if (!game.tournament) throw new AppError("Tournament not found", 404);

    await prisma.$transaction(async (tx) => {
      const tournament = game.tournament!;

      if (!tournament.settled) {
        for (const entry of tournament.entries) {
          const wallet = await tx.wallet.findUnique({
            where: { userId: entry.userId },
          });
          if (!wallet) continue;

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
              adminUserId: req.userId!,
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

      await logAdminAction(tx, {
        adminUserId: req.userId!,
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
  } catch (err) {
    next(err);
  }
});

router.get("/settings/registrations", async (_req, res, next) => {
  try {
    const open = await getBooleanSetting(prisma, "registrations_open", true);
    res.json({ registrationsOpen: open });
  } catch (err) {
    next(err);
  }
});

router.put("/settings/registrations", async (req, res, next) => {
  try {
    const open = Boolean(req.body.registrationsOpen);
    await setBooleanSetting(prisma, "registrations_open", open);
    await logAdminAction(prisma, {
      adminUserId: (req as AuthRequest).userId!,
      action: "SETTINGS_UPDATE_REGISTRATIONS",
      targetType: "APP_SETTING",
      targetId: "registrations_open",
      reason: open ? "Open registrations" : "Close registrations",
      details: { registrationsOpen: open },
    });
    res.json({ success: true, registrationsOpen: open });
  } catch (err) {
    next(err);
  }
});

export default router;
