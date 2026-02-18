"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processPendingWithdrawals = processPendingWithdrawals;
const client_1 = require("@prisma/client");
const db_1 = require("../db");
const stripe_1 = require("../lib/stripe");
const MAX_RETRIES = 3;
async function processPendingWithdrawals() {
    const now = new Date();
    await db_1.prisma.withdrawal.updateMany({
        where: {
            status: "INITIATED",
            availableAt: { lte: now },
        },
        data: {
            status: "UNDER_REVIEW",
        },
    });
    const withdrawals = await db_1.prisma.withdrawal.findMany({
        where: {
            status: "UNDER_REVIEW",
            availableAt: { lte: now },
            adminHold: false,
        },
        include: {
            user: {
                include: { wallet: true },
            },
        },
    });
    for (const withdrawal of withdrawals) {
        try {
            if (!withdrawal.user.stripeAccountId || !withdrawal.user.stripeOnboarded) {
                console.log(`User ${withdrawal.userId} not onboarded.`);
                continue;
            }
            await stripe_1.stripe.transfers.create({
                amount: withdrawal.netAmount,
                currency: "usd",
                destination: withdrawal.user.stripeAccountId,
            }, {
                idempotencyKey: withdrawal.idempotencyKey,
            });
            const payout = await stripe_1.stripe.payouts.create({
                amount: withdrawal.netAmount,
                currency: "usd",
            }, {
                stripeAccount: withdrawal.user.stripeAccountId,
            });
            await db_1.prisma.$transaction(async (tx) => {
                await tx.withdrawal.update({
                    where: { id: withdrawal.id },
                    data: {
                        status: "APPROVED",
                        stripePayoutId: payout.id,
                        processedAt: new Date(),
                    },
                });
                const wallet = await tx.wallet.findUnique({
                    where: { userId: withdrawal.userId },
                });
                if (!wallet)
                    throw new Error("Wallet missing");
                await tx.ledger.create({
                    data: {
                        walletId: wallet.id,
                        type: "WITHDRAW_COMPLETE",
                        amount: new client_1.Prisma.Decimal(withdrawal.amount),
                        balanceAfter: wallet.balance,
                        reference: withdrawal.id,
                    },
                });
            });
            console.log(`Withdrawal ${withdrawal.id} processed.`);
        }
        catch (err) {
            console.error(`Withdrawal ${withdrawal.id} failed:`, err);
            const newRetryCount = withdrawal.retryCount + 1;
            if (newRetryCount >= MAX_RETRIES) {
                await db_1.prisma.$transaction(async (tx) => {
                    await tx.withdrawal.update({
                        where: { id: withdrawal.id },
                        data: {
                            status: "REJECTED",
                            retryCount: newRetryCount,
                        },
                    });
                    const wallet = await tx.wallet.findUnique({
                        where: { userId: withdrawal.userId },
                    });
                    if (!wallet)
                        throw new Error("Wallet missing during refund");
                    const restoredBalance = wallet.balance.plus(new client_1.Prisma.Decimal(withdrawal.amount));
                    await tx.wallet.update({
                        where: { id: wallet.id },
                        data: { balance: restoredBalance },
                    });
                    await tx.ledger.create({
                        data: {
                            walletId: wallet.id,
                            type: "WITHDRAW_RELEASE",
                            amount: new client_1.Prisma.Decimal(withdrawal.amount),
                            balanceAfter: restoredBalance,
                            reference: withdrawal.id,
                        },
                    });
                });
                console.log(`Withdrawal ${withdrawal.id} rejected and refunded.`);
            }
            else {
                await db_1.prisma.withdrawal.update({
                    where: { id: withdrawal.id },
                    data: { retryCount: newRetryCount },
                });
                console.log(`Withdrawal ${withdrawal.id} retry ${newRetryCount}/${MAX_RETRIES}`);
            }
        }
    }
}
