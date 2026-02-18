import { Router } from "express";
import { stripe } from "../lib/stripe";
import { prisma } from "../db";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";

const router = Router();
const frontendBaseUrl =
  process.env.FRONTEND_BASE_URL || "https://thecardarena.com";

router.post("/create-account", authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
    });

    if (!user) throw new AppError("User not found", 404);

    if (user.stripeAccountId) {
      return res.json({ accountId: user.stripeAccountId });
    }

    const account = await stripe.accounts.create({
      type: "express",
      country: "US",
      email: user.email,
      capabilities: {
        transfers: { requested: true },
      },
    });

    await prisma.user.update({
      where: { id: user.id },
      data: {
        stripeAccountId: account.id,
      },
    });

    res.json({ accountId: account.id });

  } catch (err) {
    next(err);
  }
});

router.post("/onboard", authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
    });

    if (!user || !user.stripeAccountId) {
      throw new AppError("Stripe account not found", 400);
    }

    const accountLink = await stripe.accountLinks.create({
      account: user.stripeAccountId,
      refresh_url: `${frontendBaseUrl}/reauth`,
      return_url: `${frontendBaseUrl}/dashboard`,
      type: "account_onboarding",
    });

    res.json({ url: accountLink.url });
  } catch (err) {
    next(err);
  }
});

router.get("/status", authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
    });

    if (!user || !user.stripeAccountId) {
      throw new AppError("Stripe account not found", 400);
    }

    const account = await stripe.accounts.retrieve(user.stripeAccountId);

    const ready =
      account.details_submitted &&
      account.charges_enabled &&
      account.payouts_enabled;

    if (ready && !user.stripeOnboarded) {
      await prisma.user.update({
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
  } catch (err) {
    next(err);
  }
});

export default router;
