"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordUserSignal = recordUserSignal;
exports.createRiskFlag = createRiskFlag;
exports.evaluateMultiAccountRisk = evaluateMultiAccountRisk;
exports.evaluateWithdrawalVelocityRisk = evaluateWithdrawalVelocityRisk;
exports.evaluateRapidDepositWithdrawRisk = evaluateRapidDepositWithdrawRisk;
exports.evaluateWinRateAndCollusionRisk = evaluateWinRateAndCollusionRisk;
const client_1 = require("@prisma/client");
const metrics_1 = require("../monitoring/metrics");
const userComms_1 = require("./userComms");
const MULTI_ACCOUNT_MIN_MATCHES = Number(process.env.RISK_MULTI_ACCOUNT_MIN_MATCHES || 2);
const WITHDRAW_COUNT_24H_THRESHOLD = Number(process.env.RISK_WITHDRAW_COUNT_24H || 3);
const WITHDRAW_AMOUNT_24H_THRESHOLD = Number(process.env.RISK_WITHDRAW_AMOUNT_24H || 150000);
const RAPID_DEPOSIT_2H_THRESHOLD = Number(process.env.RISK_RAPID_DEPOSIT_2H || 10000);
const RAPID_WITHDRAW_2H_THRESHOLD = Number(process.env.RISK_RAPID_WITHDRAW_2H || 5000);
const HIGH_WIN_RATE_MIN_SAMPLE = Number(process.env.RISK_HIGH_WIN_MIN_SAMPLE || 15);
const HIGH_WIN_RATE_THRESHOLD = Number(process.env.RISK_HIGH_WIN_RATE || 0.8);
const COLLUSION_REPEAT_THRESHOLD = Number(process.env.RISK_COLLUSION_REPEAT || 3);
async function recordUserSignal(db, input) {
    await db.userSignal.create({
        data: {
            userId: input.userId,
            type: input.type,
            ip: input.ip ?? null,
            userAgent: input.userAgent ?? null,
            device: input.device ?? null,
        },
    });
}
async function createRiskFlag(db, input) {
    const existing = await db.riskFlag.findFirst({
        where: {
            userId: input.userId,
            type: input.type,
            status: "OPEN",
            createdAt: {
                gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
            },
        },
    });
    if (existing)
        return existing;
    const flag = await db.riskFlag.create({
        data: {
            userId: input.userId,
            type: input.type,
            severity: input.severity,
            score: input.score,
            reason: input.reason,
            details: input.details,
        },
    });
    await db.user.update({
        where: { id: input.userId },
        data: {
            riskScore: { increment: input.score },
        },
    });
    (0, metrics_1.incMetric)("risk.flags.created.total");
    (0, metrics_1.incMetric)(`risk.flags.type.${input.type}`);
    await (0, userComms_1.createUserNotification)(db, {
        userId: input.userId,
        type: "USER_RISK_FLAG_OPENED",
        title: "Compliance Flag Opened",
        message: `Your account was flagged: ${input.reason}`,
        payload: {
            type: input.type,
            severity: input.severity,
            reason: input.reason,
            details: input.details ?? {},
        },
    });
    const user = await db.user.findUnique({
        where: { id: input.userId },
        select: { email: true, username: true },
    });
    if (user) {
        (0, userComms_1.sendRiskFlagEmail)({
            to: user.email,
            username: user.username,
            flagType: input.type,
            severity: input.severity,
            reason: input.reason,
        }).catch(() => undefined);
    }
    return flag;
}
async function evaluateMultiAccountRisk(db, userId, ip, userAgent) {
    if (!ip || !userAgent)
        return;
    const recentSignals = await db.userSignal.findMany({
        where: {
            ip,
            userAgent,
            userId: { not: userId },
            createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
        distinct: ["userId"],
        select: { userId: true },
    });
    if (recentSignals.length >= MULTI_ACCOUNT_MIN_MATCHES) {
        await createRiskFlag(db, {
            userId,
            type: client_1.RiskFlagType.MULTI_ACCOUNT_SUSPECT,
            severity: client_1.RiskFlagSeverity.HIGH,
            score: 40,
            reason: "Device/IP pattern matches multiple accounts in 7 days.",
            details: {
                ip,
                userAgent,
                relatedUsers: recentSignals.map((s) => s.userId),
            },
        });
    }
}
async function evaluateWithdrawalVelocityRisk(db, userId) {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [count, total] = await Promise.all([
        db.withdrawal.count({
            where: {
                userId,
                createdAt: { gte: since24h },
            },
        }),
        db.withdrawal.aggregate({
            where: {
                userId,
                createdAt: { gte: since24h },
            },
            _sum: { amount: true },
        }),
    ]);
    if (count >= WITHDRAW_COUNT_24H_THRESHOLD ||
        (total._sum.amount ?? 0) >= WITHDRAW_AMOUNT_24H_THRESHOLD) {
        await createRiskFlag(db, {
            userId,
            type: client_1.RiskFlagType.WITHDRAWAL_VELOCITY,
            severity: client_1.RiskFlagSeverity.MEDIUM,
            score: 25,
            reason: "High withdrawal activity in rolling 24h window.",
            details: {
                count24h: count,
                amount24h: total._sum.amount ?? 0,
            },
        });
    }
}
async function evaluateRapidDepositWithdrawRisk(db, userId) {
    const since2h = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const [recentDeposits, recentWithdrawals] = await Promise.all([
        db.deposit.aggregate({
            where: {
                userId,
                status: "COMPLETED",
                createdAt: { gte: since2h },
            },
            _sum: { amount: true },
        }),
        db.withdrawal.aggregate({
            where: {
                userId,
                createdAt: { gte: since2h },
            },
            _sum: { amount: true },
        }),
    ]);
    const deposit2h = recentDeposits._sum.amount ?? 0;
    const withdraw2h = recentWithdrawals._sum.amount ?? 0;
    if (deposit2h >= RAPID_DEPOSIT_2H_THRESHOLD &&
        withdraw2h >= RAPID_WITHDRAW_2H_THRESHOLD) {
        await createRiskFlag(db, {
            userId,
            type: client_1.RiskFlagType.RAPID_DEPOSIT_WITHDRAW,
            severity: client_1.RiskFlagSeverity.HIGH,
            score: 35,
            reason: "Rapid deposit and withdrawal activity detected in 2h.",
            details: { deposit2h, withdraw2h },
        });
    }
}
async function evaluateWinRateAndCollusionRisk(db, winnerUserIds, loserUserIds) {
    for (const winnerUserId of winnerUserIds) {
        const recentEntries = await db.tournamentEntry.findMany({
            where: {
                userId: winnerUserId,
                tournament: {
                    status: "COMPLETED",
                },
            },
            orderBy: { createdAt: "desc" },
            take: 20,
            select: { isWinner: true },
        });
        if (recentEntries.length >= HIGH_WIN_RATE_MIN_SAMPLE) {
            const wins = recentEntries.filter((e) => e.isWinner).length;
            const winRate = wins / recentEntries.length;
            if (winRate >= HIGH_WIN_RATE_THRESHOLD) {
                await createRiskFlag(db, {
                    userId: winnerUserId,
                    type: client_1.RiskFlagType.HIGH_WIN_RATE,
                    severity: client_1.RiskFlagSeverity.MEDIUM,
                    score: 20,
                    reason: "Unusually high win rate in recent tournaments.",
                    details: {
                        wins,
                        sampleSize: recentEntries.length,
                        winRate,
                    },
                });
            }
        }
    }
    if (winnerUserIds.length !== 2 || loserUserIds.length !== 2)
        return;
    const winnerSet = [...winnerUserIds].sort();
    const loserSet = [...loserUserIds].sort();
    const recent = await db.tournament.findMany({
        where: {
            status: "COMPLETED",
            createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
        include: {
            entries: true,
        },
    });
    let repeatedPatternCount = 0;
    for (const t of recent) {
        const w = t.entries.filter((e) => e.isWinner).map((e) => e.userId).sort();
        const l = t.entries.filter((e) => !e.isWinner).map((e) => e.userId).sort();
        if (w.length === 2 && l.length === 2) {
            if (w[0] === winnerSet[0] && w[1] === winnerSet[1] && l[0] === loserSet[0] && l[1] === loserSet[1]) {
                repeatedPatternCount++;
            }
        }
    }
    if (repeatedPatternCount >= COLLUSION_REPEAT_THRESHOLD) {
        const allUsers = [...winnerUserIds, ...loserUserIds];
        for (const userId of allUsers) {
            await createRiskFlag(db, {
                userId,
                type: client_1.RiskFlagType.COLLUSION_SUSPECT,
                severity: client_1.RiskFlagSeverity.HIGH,
                score: 45,
                reason: "Repeated winner/loser pairing pattern in 30 days.",
                details: {
                    winners: winnerSet,
                    losers: loserSet,
                    repeatedPatternCount,
                },
            });
        }
    }
}
