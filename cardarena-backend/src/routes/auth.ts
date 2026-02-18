import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { Role, SignupStatus } from "@prisma/client";
import { prisma } from "../db";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import {
  evaluateMultiAccountRisk,
  recordUserSignal,
} from "../lib/risk";
import { getBooleanSetting } from "../lib/settings";
import {
  createSignupReviewNotification,
  sendAdminSignupEmail,
} from "../lib/adminNotifications";
import {
  createAdminEmailVerificationToken,
  hashAdminVerificationToken,
  sendAdminDomainVerificationEmail,
} from "../lib/adminEmailVerification";

const router = Router();

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "test") return "test_secret";
  throw new Error("JWT_SECRET is not defined");
}

const JWT_SECRET = getJwtSecret();
const ADMIN_EMAIL_DOMAIN = (process.env.ADMIN_EMAIL_DOMAIN || "thecardarena.com").toLowerCase();
const RESEND_ADMIN_VERIFY_MSG =
  "If your account requires admin email verification, a fresh link has been sent.";

/**
 * POST /auth/register
 */
router.post("/register", async (req, res, next) => {
  try {
    const registrationsOpen = await getBooleanSetting(
      prisma,
      "registrations_open",
      true
    );

    if (!registrationsOpen) {
      throw new AppError("Registrations are temporarily closed", 403);
    }

    const { email, username, password } = req.body;

    if (!email || !username || !password) {
      throw new AppError("email, username, and password required", 400);
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const isInternalAdmin = normalizedEmail.endsWith(`@${ADMIN_EMAIL_DOMAIN}`);

    const hashedPassword = await bcrypt.hash(password, 10);

    const ip = req.ip;
    const userAgent = req.get("user-agent");

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: normalizedEmail,
          username,
          password: hashedPassword,
          role: Role.USER,
          signupStatus: SignupStatus.PENDING,
          signupRequestedAt: new Date(),
          signupReviewedAt: null,
        },
      });

      await tx.wallet.create({
        data: {
          userId: user.id,
        },
      });

      await recordUserSignal(tx, {
        userId: user.id,
        type: "REGISTER",
        ip,
        userAgent,
      });

      await evaluateMultiAccountRisk(tx, user.id, ip, userAgent);
      let adminVerifyToken: string | null = null;
      if (isInternalAdmin) {
        adminVerifyToken = await createAdminEmailVerificationToken(tx, user.id);
      } else {
        await createSignupReviewNotification(tx, {
          userId: user.id,
          username: user.username,
          email: user.email,
        });
      }

      return { user, adminVerifyToken };
    });

    if (isInternalAdmin && result.adminVerifyToken) {
      sendAdminDomainVerificationEmail({
        to: result.user.email,
        username: result.user.username,
        token: result.adminVerifyToken,
      }).catch(() => undefined);
    } else {
      sendAdminSignupEmail({
        username: result.user.username,
        email: result.user.email,
      }).catch(() => undefined);
    }

    res.status(201).json({
      id: result.user.id,
      email: result.user.email,
      username: result.user.username,
      role: result.user.role,
      signupStatus: result.user.signupStatus,
      createdAt: result.user.createdAt,
      message: isInternalAdmin
        ? `Account created. Check your @${ADMIN_EMAIL_DOMAIN} inbox to verify admin access.`
        : "Signup request received. An admin will review your beta access shortly.",
    });

  } catch (err: any) {
    if (err.code === "P2002") {
      return res.status(409).json({
        error: "Email or username already exists",
      });
    }

    next(err);
  }
});

/**
 * POST /auth/login
 */
router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = String(email || "").trim().toLowerCase();

    if (!email || !password) {
      throw new AppError("Email and password required", 400);
    }

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      throw new AppError("Invalid credentials", 401);
    }

    const isValid = await bcrypt.compare(password, user.password);

    if (!isValid) {
      throw new AppError("Invalid credentials", 401);
    }

    if (user.signupStatus !== SignupStatus.APPROVED && user.role !== "ADMIN") {
      throw new AppError(
        normalizedEmail.endsWith(`@${ADMIN_EMAIL_DOMAIN}`)
          ? `Verify your @${ADMIN_EMAIL_DOMAIN} email link to activate admin access.`
          : user.signupStatus === SignupStatus.WAITLISTED
          ? "Your account is waitlisted. We will notify you when access opens."
          : "Your account is pending admin approval.",
        403
      );
    }

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      JWT_SECRET,
      { expiresIn: "15m" }
    );

    await prisma.$transaction(async (tx) => {
      await recordUserSignal(tx, {
        userId: user.id,
        type: "LOGIN",
        ip: req.ip,
        userAgent: req.get("user-agent"),
      });
      await evaluateMultiAccountRisk(tx, user.id, req.ip, req.get("user-agent"));
    });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /auth/verify-admin-email?token=...
 */
router.get("/verify-admin-email", async (req, res, next) => {
  try {
    const rawToken = String(req.query.token || "").trim();
    if (!rawToken) {
      throw new AppError("Verification token is required", 400);
    }

    const tokenHash = hashAdminVerificationToken(rawToken);
    const verification = await (prisma as any).adminEmailVerificationToken.findFirst({
      where: {
        tokenHash,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: { user: true },
    });

    if (!verification) {
      throw new AppError("Verification link is invalid or expired", 400);
    }

    await prisma.$transaction(async (tx) => {
      await (tx as any).adminEmailVerificationToken.update({
        where: { id: verification.id },
        data: { usedAt: new Date() },
      });

      await (tx as any).adminEmailVerificationToken.updateMany({
        where: { userId: verification.userId, usedAt: null },
        data: { usedAt: new Date() },
      });

      await tx.user.update({
        where: { id: verification.userId },
        data: {
          role: Role.ADMIN,
          signupStatus: SignupStatus.APPROVED,
          signupReviewedAt: new Date(),
          signupReviewedBy: null,
        },
      });
    });

    res.json({
      success: true,
      message: "Admin email verified. You can now login.",
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /auth/resend-admin-verification
 */
router.post("/resend-admin-verification", async (req, res, next) => {
  try {
    const normalizedEmail = String(req.body.email || "").trim().toLowerCase();
    if (!normalizedEmail) {
      throw new AppError("Email is required", 400);
    }

    if (!normalizedEmail.endsWith(`@${ADMIN_EMAIL_DOMAIN}`)) {
      return res.json({ success: true, message: RESEND_ADMIN_VERIFY_MSG });
    }

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user || user.role === Role.ADMIN || user.signupStatus === SignupStatus.APPROVED) {
      return res.json({ success: true, message: RESEND_ADMIN_VERIFY_MSG });
    }

    const token = await prisma.$transaction(async (tx) => {
      await (tx as any).adminEmailVerificationToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      return createAdminEmailVerificationToken(tx as any, user.id);
    });

    sendAdminDomainVerificationEmail({
      to: user.email,
      username: user.username,
      token,
    }).catch(() => undefined);

    return res.json({ success: true, message: RESEND_ADMIN_VERIFY_MSG });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /auth/me
 */
router.get("/me", authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    if (!req.userId) {
      throw new AppError("Not authenticated", 401);
    }

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new AppError("User not found", 404);
    }

    res.json(user);
  } catch (err) {
    next(err);
  }
});

export default router;


