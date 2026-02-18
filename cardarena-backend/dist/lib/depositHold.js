"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDepositReleaseAt = getDepositReleaseAt;
exports.getLockedDepositAmount = getLockedDepositAmount;
exports.consumeLockedDepositAmount = consumeLockedDepositAmount;
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
function getDepositReleaseAt(from = new Date()) {
    return new Date(from.getTime() + TWO_HOURS_MS);
}
async function getLockedDepositAmount(db, userId, now = new Date()) {
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
async function consumeLockedDepositAmount(db, userId, amount, now = new Date()) {
    if (amount <= 0)
        return 0;
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
        if (remainingToConsume <= 0)
            break;
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
