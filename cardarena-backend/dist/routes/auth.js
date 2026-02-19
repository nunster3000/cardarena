"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const client_1 = require("@prisma/client");
const db_1 = require("../db");
const auth_1 = require("../middleware/auth");
const errorHandler_1 = require("../middleware/errorHandler");
const risk_1 = require("../lib/risk");
const settings_1 = require("../lib/settings");
const adminNotifications_1 = require("../lib/adminNotifications");
const adminEmailVerification_1 = require("../lib/adminEmailVerification");
const passwordReset_1 = require("../lib/passwordReset");
const requestMeta_1 = require("../lib/requestMeta");
const router = (0, express_1.Router)();
function getJwtSecret() {
    const secret = process.env.JWT_SECRET;
    if (secret)
        return secret;
    if (process.env.NODE_ENV === "test")
        return "test_secret";
    throw new Error("JWT_SECRET is not defined");
}
const JWT_SECRET = getJwtSecret();
const ADMIN_EMAIL_DOMAIN = (process.env.ADMIN_EMAIL_DOMAIN || "thecardarena.com").toLowerCase();
const RESEND_ADMIN_VERIFY_MSG = "If your account requires admin email verification, a fresh link has been sent.";
const RESET_MSG = "If an account exists for this email, a password reset email link has been sent.";
function validatePassword(password, username) {
    const hasLength = password.length >= 8;
    const hasLetter = /[A-Za-z]/.test(password);
    const hasNumber = /\d/.test(password);
    const hasSpecial = /[^A-Za-z0-9]/.test(password);
    const notSameAsUsername = password.trim().toLowerCase() !== username.trim().toLowerCase();
    const valid = hasLength &&
        hasLetter &&
        hasNumber &&
        hasSpecial &&
        notSameAsUsername;
    return {
        valid,
        requirements: {
            hasLength,
            hasLetter,
            hasNumber,
            hasSpecial,
            notSameAsUsername,
        },
    };
}
function parseDateOfBirth(value) {
    const raw = String(value || "").trim();
    if (!raw)
        throw new errorHandler_1.AppError("Date of birth is required", 400);
    const dob = new Date(raw);
    if (Number.isNaN(dob.getTime())) {
        throw new errorHandler_1.AppError("Date of birth is invalid", 400);
    }
    const now = new Date();
    if (dob > now) {
        throw new errorHandler_1.AppError("Date of birth cannot be in the future", 400);
    }
    let age = now.getUTCFullYear() - dob.getUTCFullYear();
    const monthDiff = now.getUTCMonth() - dob.getUTCMonth();
    if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < dob.getUTCDate())) {
        age--;
    }
    if (age < 18) {
        throw new errorHandler_1.AppError("You must be at least 18 years old to register", 400);
    }
    return dob;
}
function parseCountryCode(value) {
    const countryCode = String(value || "").trim().toUpperCase();
    if (!countryCode)
        throw new errorHandler_1.AppError("Country is required", 400);
    if (!/^[A-Z]{2}$/.test(countryCode)) {
        throw new errorHandler_1.AppError("Country must be a 2-letter ISO code (example: US)", 400);
    }
    return countryCode;
}
function parseRegion(value) {
    const region = String(value || "").trim();
    if (!region)
        throw new errorHandler_1.AppError("State/region is required", 400);
    if (region.length > 120) {
        throw new errorHandler_1.AppError("State/region is too long", 400);
    }
    return region;
}
/**
 * POST /auth/register
 */
router.post("/register", async (req, res, next) => {
    try {
        const registrationsOpen = await (0, settings_1.getBooleanSetting)(db_1.prisma, "registrations_open", true);
        if (!registrationsOpen) {
            throw new errorHandler_1.AppError("Registrations are temporarily closed", 403);
        }
        const { email, username, password, dateOfBirth, countryCode, region, acceptedTerms, acceptedPrivacy, } = req.body;
        if (!email || !username || !password || !dateOfBirth || !countryCode || !region) {
            throw new errorHandler_1.AppError("email, username, password, dateOfBirth, countryCode, and region are required", 400);
        }
        if (acceptedTerms !== true || acceptedPrivacy !== true) {
            throw new errorHandler_1.AppError("You must accept the Terms of Service and Privacy Policy", 400);
        }
        const passwordValidation = validatePassword(String(password), String(username));
        if (!passwordValidation.valid) {
            throw new errorHandler_1.AppError("Password must be at least 8 characters, include at least 1 letter, 1 number, 1 special character, and cannot match username.", 400);
        }
        const normalizedEmail = String(email).trim().toLowerCase();
        const parsedDateOfBirth = parseDateOfBirth(dateOfBirth);
        const parsedCountryCode = parseCountryCode(countryCode);
        const parsedRegion = parseRegion(region);
        const isInternalAdmin = normalizedEmail.endsWith(`@${ADMIN_EMAIL_DOMAIN}`);
        const hashedPassword = await bcrypt_1.default.hash(password, 10);
        const meta = (0, requestMeta_1.getRequestMeta)(req);
        const result = await db_1.prisma.$transaction(async (tx) => {
            const user = await tx.user.create({
                data: {
                    email: normalizedEmail,
                    username,
                    password: hashedPassword,
                    dateOfBirth: parsedDateOfBirth,
                    countryCode: parsedCountryCode,
                    region: parsedRegion,
                    role: client_1.Role.USER,
                    signupStatus: client_1.SignupStatus.PENDING,
                    signupRequestedAt: new Date(),
                    signupReviewedAt: null,
                    termsAcceptedAt: new Date(),
                    privacyAcceptedAt: new Date(),
                },
            });
            await tx.wallet.create({
                data: {
                    userId: user.id,
                },
            });
            await (0, risk_1.recordUserSignal)(tx, {
                userId: user.id,
                type: "REGISTER",
                ip: meta.ip,
                userAgent: meta.userAgent,
                device: meta.device,
            });
            await (0, risk_1.evaluateMultiAccountRisk)(tx, user.id, meta.ip, meta.userAgent);
            let adminVerifyToken = null;
            if (isInternalAdmin) {
                adminVerifyToken = await (0, adminEmailVerification_1.createAdminEmailVerificationToken)(tx, user.id);
            }
            else {
                await (0, adminNotifications_1.createSignupReviewNotification)(tx, {
                    userId: user.id,
                    username: user.username,
                    email: user.email,
                });
            }
            return { user, adminVerifyToken };
        });
        if (isInternalAdmin && result.adminVerifyToken) {
            (0, adminEmailVerification_1.sendAdminDomainVerificationEmail)({
                to: result.user.email,
                username: result.user.username,
                token: result.adminVerifyToken,
            }).catch(() => undefined);
        }
        else {
            (0, adminNotifications_1.sendAdminSignupEmail)({
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
    }
    catch (err) {
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
            throw new errorHandler_1.AppError("Email and password required", 400);
        }
        const user = await db_1.prisma.user.findUnique({
            where: { email: normalizedEmail },
        });
        if (!user) {
            throw new errorHandler_1.AppError("Invalid credentials", 401);
        }
        const isValid = await bcrypt_1.default.compare(password, user.password);
        if (!isValid) {
            throw new errorHandler_1.AppError("Invalid credentials", 401);
        }
        if (user.signupStatus !== client_1.SignupStatus.APPROVED && user.role !== "ADMIN") {
            throw new errorHandler_1.AppError(normalizedEmail.endsWith(`@${ADMIN_EMAIL_DOMAIN}`)
                ? `Verify your @${ADMIN_EMAIL_DOMAIN} email link to activate admin access.`
                : user.signupStatus === client_1.SignupStatus.WAITLISTED
                    ? "Your account is waitlisted. We will notify you when access opens."
                    : "Your account is pending admin approval.", 403);
        }
        const token = jsonwebtoken_1.default.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: "15m" });
        await db_1.prisma.$transaction(async (tx) => {
            const meta = (0, requestMeta_1.getRequestMeta)(req);
            await (0, risk_1.recordUserSignal)(tx, {
                userId: user.id,
                type: "LOGIN",
                ip: meta.ip,
                userAgent: meta.userAgent,
                device: meta.device,
            });
            await (0, risk_1.evaluateMultiAccountRisk)(tx, user.id, meta.ip, meta.userAgent);
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
    }
    catch (err) {
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
            throw new errorHandler_1.AppError("Verification token is required", 400);
        }
        const tokenHash = (0, adminEmailVerification_1.hashAdminVerificationToken)(rawToken);
        const verification = await db_1.prisma.adminEmailVerificationToken.findFirst({
            where: {
                tokenHash,
                usedAt: null,
                expiresAt: { gt: new Date() },
            },
            include: { user: true },
        });
        if (!verification) {
            throw new errorHandler_1.AppError("Verification link is invalid or expired", 400);
        }
        await db_1.prisma.$transaction(async (tx) => {
            await tx.adminEmailVerificationToken.update({
                where: { id: verification.id },
                data: { usedAt: new Date() },
            });
            await tx.adminEmailVerificationToken.updateMany({
                where: { userId: verification.userId, usedAt: null },
                data: { usedAt: new Date() },
            });
            await tx.user.update({
                where: { id: verification.userId },
                data: {
                    role: client_1.Role.ADMIN,
                    signupStatus: client_1.SignupStatus.APPROVED,
                    signupReviewedAt: new Date(),
                    signupReviewedBy: null,
                },
            });
        });
        res.json({
            success: true,
            message: "Admin email verified. You can now login.",
        });
    }
    catch (err) {
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
            throw new errorHandler_1.AppError("Email is required", 400);
        }
        if (!normalizedEmail.endsWith(`@${ADMIN_EMAIL_DOMAIN}`)) {
            return res.json({ success: true, message: RESEND_ADMIN_VERIFY_MSG });
        }
        const user = await db_1.prisma.user.findUnique({
            where: { email: normalizedEmail },
        });
        if (!user || user.role === client_1.Role.ADMIN || user.signupStatus === client_1.SignupStatus.APPROVED) {
            return res.json({ success: true, message: RESEND_ADMIN_VERIFY_MSG });
        }
        const token = await db_1.prisma.$transaction(async (tx) => {
            await tx.adminEmailVerificationToken.updateMany({
                where: { userId: user.id, usedAt: null },
                data: { usedAt: new Date() },
            });
            return (0, adminEmailVerification_1.createAdminEmailVerificationToken)(tx, user.id);
        });
        (0, adminEmailVerification_1.sendAdminDomainVerificationEmail)({
            to: user.email,
            username: user.username,
            token,
        }).catch(() => undefined);
        return res.json({ success: true, message: RESEND_ADMIN_VERIFY_MSG });
    }
    catch (err) {
        next(err);
    }
});
/**
 * POST /auth/forgot-password
 */
router.post("/forgot-password", async (req, res, next) => {
    try {
        const normalizedEmail = String(req.body.email || "").trim().toLowerCase();
        if (!normalizedEmail) {
            throw new errorHandler_1.AppError("Email is required", 400);
        }
        const user = await db_1.prisma.user.findUnique({
            where: { email: normalizedEmail },
        });
        if (!user) {
            return res.json({ success: true, message: RESET_MSG });
        }
        const token = await db_1.prisma.$transaction(async (tx) => {
            await tx.passwordResetToken.updateMany({
                where: { userId: user.id, usedAt: null },
                data: { usedAt: new Date() },
            });
            return (0, passwordReset_1.createPasswordResetToken)(tx, user.id);
        });
        (0, passwordReset_1.sendPasswordResetEmail)({
            to: user.email,
            username: user.username,
            token,
        }).catch(() => undefined);
        return res.json({ success: true, message: RESET_MSG });
    }
    catch (err) {
        next(err);
    }
});
/**
 * POST /auth/reset-password
 */
router.post("/reset-password", async (req, res, next) => {
    try {
        const rawToken = String(req.body.token || "").trim();
        const password = String(req.body.password || "");
        if (!rawToken || !password) {
            throw new errorHandler_1.AppError("Token and password are required", 400);
        }
        const tokenHash = (0, passwordReset_1.hashPasswordResetToken)(rawToken);
        const resetToken = await db_1.prisma.passwordResetToken.findFirst({
            where: {
                tokenHash,
                usedAt: null,
                expiresAt: { gt: new Date() },
            },
            include: { user: true },
        });
        if (!resetToken) {
            throw new errorHandler_1.AppError("Reset link is invalid or expired", 400);
        }
        const passwordValidation = validatePassword(password, resetToken.user.username);
        if (!passwordValidation.valid) {
            throw new errorHandler_1.AppError("Password must be at least 8 characters, include at least 1 letter, 1 number, 1 special character, and cannot match username.", 400);
        }
        const hashed = await bcrypt_1.default.hash(password, 10);
        await db_1.prisma.$transaction(async (tx) => {
            await tx.user.update({
                where: { id: resetToken.userId },
                data: { password: hashed },
            });
            await tx.passwordResetToken.update({
                where: { id: resetToken.id },
                data: { usedAt: new Date() },
            });
            await tx.passwordResetToken.updateMany({
                where: { userId: resetToken.userId, usedAt: null },
                data: { usedAt: new Date() },
            });
        });
        return res.json({ success: true, message: "Password reset successfully. You can now login." });
    }
    catch (err) {
        next(err);
    }
});
/**
 * GET /auth/me
 */
router.get("/me", auth_1.authMiddleware, async (req, res, next) => {
    try {
        if (!req.userId) {
            throw new errorHandler_1.AppError("Not authenticated", 401);
        }
        const user = await db_1.prisma.user.findUnique({
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
            throw new errorHandler_1.AppError("User not found", 404);
        }
        res.json(user);
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
