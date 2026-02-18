import { Prisma, PrismaClient } from "@prisma/client";

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

type DbClient = PrismaClient | Prisma.TransactionClient;

export function getDepositReleaseAt(from = new Date()) {
  return new Date(from.getTime() + TWO_HOURS_MS);
}

export async function getLockedDepositAmount(
  db: DbClient,
  userId: string,
  now = new Date()
) {
  const result = await db.depositHold.aggregate({
    where: {
      userId,
      releaseAt: { gt: now },
      remainingAmount: { gt: 0 },
    },
    _sum: {
      remainingAmount: true,
    },
  });

  return result._sum.remainingAmount ?? 0;
}

export async function consumeLockedDepositAmount(
  db: DbClient,
  userId: string,
  amount: number,
  now = new Date()
) {
  if (amount <= 0) return 0;

  const holds = await db.depositHold.findMany({
    where: {
      userId,
      releaseAt: { gt: now },
      remainingAmount: { gt: 0 },
    },
    orderBy: [{ releaseAt: "asc" }, { createdAt: "asc" }],
  });

  let remainingToConsume = amount;
  let consumed = 0;

  for (const hold of holds) {
    if (remainingToConsume <= 0) break;

    const deduction = Math.min(hold.remainingAmount, remainingToConsume);
    const nextRemaining = hold.remainingAmount - deduction;

    await db.depositHold.update({
      where: { id: hold.id },
      data: { remainingAmount: nextRemaining },
    });

    consumed += deduction;
    remainingToConsume -= deduction;
  }

  return consumed;
}
