"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const stripe_1 = require("../lib/stripe");
const db_1 = require("../db");
const depositHold_1 = require("../lib/depositHold");
const userComms_1 = require("../lib/userComms");
const router = (0, express_1.Router)();
router.post("/", async (req, res) => {
    const sig = req.headers["stripe-signature"];
    if (!sig) {
        return res.status(400).json({ error: "Missing Stripe signature" });
    }
    let event;
    try {
        event = stripe_1.stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    }
    catch (err) {
        console.error("Webhook signature verification failed:", err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }
    // Only handle successful deposits
    if (event.type === "payment_intent.succeeded") {
        console.log("🔥 payment_intent.succeeded received");
        console.log("Metadata:", event.data.object.metadata);
        const paymentIntent = event.data.object;
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
            await db_1.prisma.$transaction(async (tx) => {
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
                        releaseAt: (0, depositHold_1.getDepositReleaseAt)(),
                    },
                });
                await (0, userComms_1.createUserNotification)(tx, {
                    userId,
                    type: "USER_DEPOSIT_COMPLETED",
                    title: "Deposit Completed",
                    message: `Your deposit of $${(amount / 100).toFixed(2)} is now available for play.`,
                    payload: { depositId, amount, releaseAt: (0, depositHold_1.getDepositReleaseAt)().toISOString() },
                });
            });
            console.log("Deposit processed safely:", reference);
        }
        catch (err) {
            if (err.code === "P2002") {
                console.log("Duplicate webhook ignored:", reference);
            }
            else {
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
        const account = event.data.object;
        const user = await db_1.prisma.user.findFirst({
            where: { stripeAccountId: account.id },
        });
        if (user) {
            const onboarded = account.details_submitted &&
                account.charges_enabled &&
                account.payouts_enabled;
            await db_1.prisma.user.update({
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
        const payout = event.data.object;
        const withdrawal = await db_1.prisma.withdrawal.findFirst({
            where: { stripePayoutId: payout.id },
        });
        if (withdrawal) {
            await db_1.prisma.withdrawal.update({
                where: { id: withdrawal.id },
                data: {
                    status: "COMPLETED",
                },
            });
            await (0, userComms_1.createUserNotification)(db_1.prisma, {
                userId: withdrawal.userId,
                type: "USER_WITHDRAWAL_COMPLETED",
                title: "Withdrawal Completed",
                message: `Your withdrawal of $${(withdrawal.amount / 100).toFixed(2)} was completed.`,
                payload: { withdrawalId: withdrawal.id, amount: withdrawal.amount },
            });
            console.log(`Payout confirmed for withdrawal ${withdrawal.id}`);
        }
    }
    // Payout failed
    if (event.type === "payout.failed") {
        const payout = event.data.object;
        const withdrawal = await db_1.prisma.withdrawal.findFirst({
            where: { stripePayoutId: payout.id },
        });
        if (withdrawal) {
            await db_1.prisma.withdrawal.update({
                where: { id: withdrawal.id },
                data: {
                    status: "REJECTED",
                },
            });
            await (0, userComms_1.createUserNotification)(db_1.prisma, {
                userId: withdrawal.userId,
                type: "USER_WITHDRAWAL_REJECTED",
                title: "Withdrawal Failed",
                message: `Your withdrawal of $${(withdrawal.amount / 100).toFixed(2)} failed. Please retry or contact support.`,
                payload: { withdrawalId: withdrawal.id, amount: withdrawal.amount },
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
exports.default = router;
