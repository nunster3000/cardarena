"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const stripe_1 = require("../lib/stripe");
const db_1 = require("../db");
const auth_1 = require("../middleware/auth");
const errorHandler_1 = require("../middleware/errorHandler");
const router = (0, express_1.Router)();
const frontendBaseUrl = process.env.FRONTEND_BASE_URL || "https://thecardarena.com";
router.post("/create-account", auth_1.authMiddleware, async (req, res, next) => {
    try {
        const user = await db_1.prisma.user.findUnique({
            where: { id: req.userId },
        });
        if (!user)
            throw new errorHandler_1.AppError("User not found", 404);
        if (user.stripeAccountId) {
            return res.json({ accountId: user.stripeAccountId });
        }
        const account = await stripe_1.stripe.accounts.create({
            type: "express",
            country: "US",
            email: user.email,
            capabilities: {
                transfers: { requested: true },
            },
        });
        await db_1.prisma.user.update({
            where: { id: user.id },
            data: {
                stripeAccountId: account.id,
            },
        });
        res.json({ accountId: account.id });
    }
    catch (err) {
        next(err);
    }
});
router.post("/onboard", auth_1.authMiddleware, async (req, res, next) => {
    try {
        const user = await db_1.prisma.user.findUnique({
            where: { id: req.userId },
        });
        if (!user || !user.stripeAccountId) {
            throw new errorHandler_1.AppError("Stripe account not found", 400);
        }
        const accountLink = await stripe_1.stripe.accountLinks.create({
            account: user.stripeAccountId,
            refresh_url: `${frontendBaseUrl}/reauth`,
            return_url: `${frontendBaseUrl}/dashboard`,
            type: "account_onboarding",
        });
        res.json({ url: accountLink.url });
    }
    catch (err) {
        next(err);
    }
});
router.get("/status", auth_1.authMiddleware, async (req, res, next) => {
    try {
        const user = await db_1.prisma.user.findUnique({
            where: { id: req.userId },
        });
        if (!user || !user.stripeAccountId) {
            throw new errorHandler_1.AppError("Stripe account not found", 400);
        }
        const account = await stripe_1.stripe.accounts.retrieve(user.stripeAccountId);
        const ready = account.details_submitted &&
            account.charges_enabled &&
            account.payouts_enabled;
        if (ready && !user.stripeOnboarded) {
            await db_1.prisma.user.update({
                where: { id: user.id },
                data: { stripeOnboarded: true },
            });
        }
        res.json({
            ready,
            detailsSubmitted: account.details_submitted,
            chargesEnabled: account.charges_enabled,
            payoutsEnabled: account.payouts_enabled,
        });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
