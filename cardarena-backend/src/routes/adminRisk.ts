import { Router } from "express";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { prisma } from "../db";
import { logAdminAction } from "../lib/adminAudit";

const router = Router();

function ensureAdmin(req: AuthRequest) {
  if (req.userRole !== "ADMIN") {
    throw new AppError("Unauthorized", 403);
  }
}

router.get("/flags", authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    ensureAdmin(req);

    const status = (req.query.status as string) || "OPEN";
    const severity = req.query.severity as string | undefined;
    const take = Math.min(Number(req.query.take) || 100, 250);

    const flags = await prisma.riskFlag.findMany({
      where: {
        status: status === "ALL" ? undefined : (status as any),
        severity: severity as any,
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
  } catch (err) {
    next(err);
  }
});

router.post("/flags/:id/resolve", authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    ensureAdmin(req);

    const flag = await prisma.riskFlag.update({
      where: { id: req.params.id },
      data: {
        status: "RESOLVED",
        resolvedAt: new Date(),
      },
    });

    await logAdminAction(prisma, {
      adminUserId: req.userId!,
      action: "RISK_FLAG_RESOLVE",
      targetType: "RISK_FLAG",
      targetId: flag.id,
      reason: "Manual admin resolve",
    });

    res.json({ success: true, flag });
  } catch (err) {
    next(err);
  }
});

router.get("/overview", authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    ensureAdmin(req);

    const [activeGames, openFlags, highFlags, blockedUsers, heldWithdrawals, balances] =
      await Promise.all([
        prisma.game.count({
          where: { status: { in: ["WAITING", "ACTIVE", "PAUSED"] } },
        }),
        prisma.riskFlag.count({ where: { status: "OPEN" } }),
        prisma.riskFlag.count({
          where: { status: "OPEN", severity: "HIGH" },
        }),
        prisma.user.count({ where: { withdrawalBlocked: true } }),
        prisma.withdrawal.count({
          where: {
            status: { in: ["INITIATED", "UNDER_REVIEW", "APPROVED"] },
            adminHold: true,
          },
        }),
        prisma.wallet.aggregate({ _sum: { balance: true } }),
      ]);

    res.json({
      activeGames,
      openFlags,
      highFlags,
      blockedUsers,
      heldWithdrawals,
      totalUserWalletBalance: balances._sum.balance ?? 0,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/withdrawals", authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    ensureAdmin(req);

    const held = req.query.held as string | undefined;
    const status = req.query.status as string | undefined;
    const take = Math.min(Number(req.query.take) || 100, 250);

    const withdrawals = await prisma.withdrawal.findMany({
      where: {
        adminHold: held == null ? undefined : held === "true",
        status: status as any,
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
  } catch (err) {
    next(err);
  }
});

router.post(
  "/withdrawals/:id/hold",
  authMiddleware,
  async (req: AuthRequest, res, next) => {
    try {
      ensureAdmin(req);
      const reason = String(req.body.reason || "Manual admin hold");

      const withdrawal = await prisma.withdrawal.update({
        where: { id: req.params.id },
        data: {
          adminHold: true,
          adminHoldReason: reason,
          adminHeldBy: req.userId,
          adminHoldAt: new Date(),
        },
      });

      await logAdminAction(prisma, {
        adminUserId: req.userId!,
        action: "WITHDRAWAL_HOLD",
        targetType: "WITHDRAWAL",
        targetId: withdrawal.id,
        reason,
      });

      res.json({ success: true, withdrawal });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  "/withdrawals/:id/release",
  authMiddleware,
  async (req: AuthRequest, res, next) => {
    try {
      ensureAdmin(req);

      const withdrawal = await prisma.withdrawal.update({
        where: { id: req.params.id },
        data: {
          adminHold: false,
          adminHoldReason: null,
          adminHeldBy: null,
          adminHoldAt: null,
        },
      });

      await logAdminAction(prisma, {
        adminUserId: req.userId!,
        action: "WITHDRAWAL_RELEASE",
        targetType: "WITHDRAWAL",
        targetId: withdrawal.id,
        reason: "Manual hold release",
      });

      res.json({ success: true, withdrawal });
    } catch (err) {
      next(err);
    }
  }
);

router.post("/users/:id/block-withdrawals", authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    ensureAdmin(req);
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { withdrawalBlocked: true },
    });
    await logAdminAction(prisma, {
      adminUserId: req.userId!,
      action: "USER_BLOCK_WITHDRAWALS",
      targetType: "USER",
      targetId: user.id,
      reason: "Admin withdrawal block",
    });
    res.json({ success: true, userId: user.id });
  } catch (err) {
    next(err);
  }
});

router.post(
  "/users/:id/unblock-withdrawals",
  authMiddleware,
  async (req: AuthRequest, res, next) => {
    try {
      ensureAdmin(req);
      const user = await prisma.user.update({
        where: { id: req.params.id },
        data: { withdrawalBlocked: false },
      });
      await logAdminAction(prisma, {
        adminUserId: req.userId!,
        action: "USER_UNBLOCK_WITHDRAWALS",
        targetType: "USER",
        targetId: user.id,
        reason: "Admin withdrawal unblock",
      });
      res.json({ success: true, userId: user.id });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
