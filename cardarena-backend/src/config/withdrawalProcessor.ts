import { prisma } from "../db";
import { stripe } from "../lib/stripe";
import { Prisma } from "@prisma/client";

const MAX_RETRIES = 3;

export async function processPendingWithdrawals() {
  const now = new Date();

  // Step 1: Lock eligible withdrawals
  await prisma.withdrawal.updateMany({
    where: {
      status: "INITIATED",
      availableAt: { lte: now },
    },
    data: {
      status: "UNDER_REVIEW",
    },
  });

  // Step 2: Fetch locked withdrawals
  const withdrawals = await prisma.withdrawal.findMany({
    where: {
    status: "UNDER_REVIEW",
    availableAt: { lte: now },
  },
    include: {
      user: {
        include: { wallet: true },
      },
    },
  });

  for (const withdrawal of withdrawals) {
    try {
      // 🔹 Ensure onboarding complete
      if (
        !withdrawal.user.stripeAccountId ||
        !withdrawal.user.stripeOnboarded
      ) {
        console.log(`User ${withdrawal.userId} not onboarded.`);
        continue;
      }

      // 🔹 1️⃣ Transfer from platform → connected account
      if (withdrawal.status !== "APPROVED") return;

      const transfer = await stripe.transfers.create(
        {
          amount: withdrawal.netAmount,
          currency: "usd",
          destination: withdrawal.user.stripeAccountId,
        },
        {
          idempotencyKey: withdrawal.idempotencyKey,
        }
      );

      // 🔹 2️⃣ Create payout to bank
      const payout = await stripe.payouts.create(
        {
          amount: withdrawal.netAmount,
          currency: "usd",
        },
        {
          stripeAccount: withdrawal.user.stripeAccountId,
        }
      );

      // 🔹 Finalize DB updates
      await prisma.$transaction(async (tx) => {
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

        if (!wallet) throw new Error("Wallet missing");

        await tx.ledger.create({
          data: {
            walletId: wallet.id,
            type: "WITHDRAW_COMPLETE",
            amount: new Prisma.Decimal(withdrawal.amount),
            balanceAfter: wallet.balance,
            reference: withdrawal.id,
          },
        });
      });

      console.log(`Withdrawal ${withdrawal.id} completed.`);
    } catch (err) {
      console.error(`Withdrawal ${withdrawal.id} failed:`, err);

      const newRetryCount = withdrawal.retryCount + 1;

      if (newRetryCount >= MAX_RETRIES) {
        await prisma.$transaction(async (tx) => {
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

          if (!wallet) throw new Error("Wallet missing during refund");

          const restoredBalance = wallet.balance.plus(
            new Prisma.Decimal(withdrawal.amount)
          );

          await tx.wallet.update({
            where: { id: wallet.id },
            data: { balance: restoredBalance },
          });

          await tx.ledger.create({
            data: {
              walletId: wallet.id,
              type: "WITHDRAW_RELEASE",
              amount: new Prisma.Decimal(withdrawal.amount),
              balanceAfter: restoredBalance,
              reference: withdrawal.id,
            },
          });
        });

        console.log(`Withdrawal ${withdrawal.id} rejected and refunded.`);
      } else {
        await prisma.withdrawal.update({
          where: { id: withdrawal.id },
          data: { retryCount: newRetryCount },
        });

        console.log(
          `Withdrawal ${withdrawal.id} retry ${newRetryCount}/${MAX_RETRIES}`
        );
      }
    }
  }
}




