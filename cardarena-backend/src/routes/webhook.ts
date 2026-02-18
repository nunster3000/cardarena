import { Router, Request, Response } from "express";
import Stripe from "stripe";
import { stripe } from "../lib/stripe";
import { prisma } from "../db";
import { getDepositReleaseAt } from "../lib/depositHold";

const router = Router();

router.post("/", async (req: Request, res: Response) => {
  const sig = req.headers["stripe-signature"] as string;

  if (!sig) {
    return res.status(400).json({ error: "Missing Stripe signature" });
  }

  let event: any;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    console.error("Webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Only handle successful deposits
  if (event.type === "payment_intent.succeeded") {
    console.log("🔥 payment_intent.succeeded received");
    console.log("Metadata:", event.data.object.metadata);

    const paymentIntent = event.data.object as Stripe.PaymentIntent;

    const depositId = paymentIntent.metadata.depositId;
    const userId = paymentIntent.metadata.userId;
    const amount = paymentIntent.amount;
    const reference = paymentIntent.id;

    if (!depositId || !userId) {
      console.error("Missing depositId or userId metadata");
      return res.status(400).json({ error: "Missing metadata" });
    }

    try {
      console.log("Processing deposit:", depositId);

      await prisma.$transaction(async (tx) => {
        // 1️⃣ Find deposit
        const deposit = await tx.deposit.findUnique({
          where: { id: depositId },
        });

        if (!deposit) {
          throw new Error("Deposit not found");
        }

        if (deposit.status !== "PENDING") {
          console.log("Deposit already processed:", depositId);
          return;
        }

        if (deposit.amount !== amount) {
          throw new Error("Deposit amount mismatch");
        }

        // 2️⃣ Find wallet
        const wallet = await tx.wallet.findUnique({
          where: { userId },
        });

        if (!wallet) {
          throw new Error("Wallet not found");
        }

        const newBalance = wallet.balance.plus(amount);

        // 3️⃣ Update wallet
        console.log("Wallet before update:", wallet.balance.toString());
        console.log("Amount:", amount);

        await tx.wallet.update({
          where: { userId },
          data: {
            balance: newBalance,
          },
        });

        // 4️⃣ Create ledger entry
        await tx.ledger.create({
          data: {
            walletId: wallet.id,
            type: "DEPOSIT",
            amount,
            balanceAfter: newBalance,
            reference,
          },
        });

        // 5️⃣ Mark deposit completed
        await tx.deposit.update({
          where: { id: depositId },
          data: {
            status: "COMPLETED",
          },
        });

        await tx.depositHold.create({
          data: {
            userId,
            depositId,
            amount,
            remainingAmount: amount,
            releaseAt: getDepositReleaseAt(),
          },
        });
      });

      console.log("Deposit processed safely:", reference);
    } catch (err: any) {
      if (err.code === "P2002") {
        console.log("Duplicate webhook ignored:", reference);
      } else {
        console.error("Deposit processing error:", err);
        return res.status(500).json({ error: "Webhook processing failed" });
      }
    }
  }

  // ===============================
  // STRIPE CONNECT EVENTS
  // ===============================

  // Account updates (onboarding / verification changes)
  if (event.type === "account.updated") {
    const account = event.data.object as Stripe.Account;

    const user = await prisma.user.findFirst({
      where: { stripeAccountId: account.id },
    });

    if (user) {
      const onboarded =
        account.details_submitted &&
        account.charges_enabled &&
        account.payouts_enabled;

      await prisma.user.update({
        where: { id: user.id },
        data: {
          stripeOnboarded: onboarded,
        },
      });

      console.log(`Stripe account updated for user ${user.id}`);
    }
  }

  // Payout succeeded
  if (event.type === "payout.paid") {
    const payout = event.data.object as Stripe.Payout;

    const withdrawal = await prisma.withdrawal.findFirst({
      where: { stripePayoutId: payout.id },
    });

    if (withdrawal) {
      await prisma.withdrawal.update({
        where: { id: withdrawal.id },
        data: {
          status: "COMPLETED",
        },
      });

      console.log(`Payout confirmed for withdrawal ${withdrawal.id}`);
    }
  }

  // Payout failed
  if (event.type === "payout.failed") {
    const payout = event.data.object as Stripe.Payout;

    const withdrawal = await prisma.withdrawal.findFirst({
      where: { stripePayoutId: payout.id },
    });

    if (withdrawal) {
      await prisma.withdrawal.update({
        where: { id: withdrawal.id },
        data: {
          status: "REJECTED",
        },
      });

      console.log(`Payout failed for withdrawal ${withdrawal.id}`);
    }
  }

  if (event.type === "transfer.failed") {
    console.log("Transfer failed:", event.data.object.id);
  }

  if (event.type === "transfer.paid") {
    console.log("Transfer paid:", event.data.object.id);
  }

  res.json({ received: true });
});

export default router;
