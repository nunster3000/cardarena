"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.leaveQueue = leaveQueue;
exports.getMatchmakingHealth = getMatchmakingHealth;
exports.forceFillWithBots = forceFillWithBots;
exports.joinQueue = joinQueue;
const crypto_1 = __importDefault(require("crypto"));
const db_1 = require("../db");
const engine_1 = require("./engine");
const gameplayLog_1 = require("../lib/gameplayLog");
const metrics_1 = require("../monitoring/metrics");
const io_1 = require("../socket/io");
const redis_1 = require("../lib/redis");
const waitingQueues = {};
const pendingCallbacks = new Map();
const botFillTimers = new Map();
const MM_QUEUE_PREFIX = "mm:queue:";
const MM_USER_QUEUE_PREFIX = "mm:user:";
const MM_META_HASH = "mm:meta";
const MM_MATCH_LOCK_PREFIX = "mm:lock:";
const BOT_FILL_DELAY_MS = 15000;
function queueKey(entryFee) {
    return `${MM_QUEUE_PREFIX}${entryFee}`;
}
function userQueueKey(userId) {
    return `${MM_USER_QUEUE_PREFIX}${userId}`;
}
function lockKey(entryFee) {
    return `${MM_MATCH_LOCK_PREFIX}${entryFee}`;
}
function clearBotFillTimer(userId) {
    const timer = botFillTimers.get(userId);
    if (!timer)
        return;
    clearTimeout(timer);
    botFillTimers.delete(userId);
}
function parseQueueMeta(raw) {
    if (!raw)
        return undefined;
    try {
        return JSON.parse(raw);
    }
    catch {
        return undefined;
    }
}
async function leaveQueueRedis(userId, entryFee) {
    const client = await (0, redis_1.getRedisClient)();
    if (!client)
        return;
    const knownFeeRaw = entryFee ?? Number(await client.get(userQueueKey(userId)));
    if (Number.isFinite(knownFeeRaw)) {
        await client.lRem(queueKey(Number(knownFeeRaw)), 0, userId);
    }
    await Promise.all([client.del(userQueueKey(userId)), client.hDel(MM_META_HASH, userId)]);
}
function scheduleBotFillMemory(entryFee, userId) {
    if (entryFee !== 0)
        return;
    clearBotFillTimer(userId);
    const timer = setTimeout(() => {
        void tryFillWithBotsMemory(entryFee, userId);
    }, BOT_FILL_DELAY_MS);
    botFillTimers.set(userId, timer);
}
async function tryFillWithBotsMemory(entryFee, queuedUserId) {
    if (entryFee !== 0)
        return;
    const queue = waitingQueues[entryFee] || [];
    if (!queue.some((p) => p.userId === queuedUserId))
        return;
    const playersWithMeta = queue.splice(0, Math.min(4, queue.length));
    if (!playersWithMeta.length)
        return;
    const players = playersWithMeta.map((p) => p.userId);
    const botCount = Math.max(0, 4 - players.length);
    const metaByUserId = new Map(playersWithMeta.map((p) => [p.userId, p.meta]));
    const { game } = await createTournamentWithPlayers(players, entryFee, metaByUserId, botCount);
    (0, metrics_1.incMetric)("matchmaking.matches.created.total");
    for (const pid of players) {
        clearBotFillTimer(pid);
        const cb = pendingCallbacks.get(pid);
        if (!cb)
            continue;
        await cb({ gameId: game.id, playerIds: players });
        pendingCallbacks.delete(pid);
    }
}
async function tryFillWithBotsRedis(entryFee, queuedUserId, onMatch) {
    if (entryFee !== 0)
        return;
    clearBotFillTimer(queuedUserId);
    const client = await (0, redis_1.getRedisClient)();
    if (!client)
        return;
    const timer = setTimeout(() => {
        void (async () => {
            const members = await client.lRange(queueKey(entryFee), 0, -1);
            if (!members.includes(queuedUserId))
                return;
            const token = crypto_1.default.randomUUID();
            const acquired = await client.set(lockKey(entryFee), token, { NX: true, PX: 5000 });
            if (!acquired)
                return;
            try {
                const current = await client.lRange(queueKey(entryFee), 0, 3);
                if (!current.length)
                    return;
                await client.lTrim(queueKey(entryFee), current.length, -1);
                for (const pid of current) {
                    await client.del(userQueueKey(pid));
                    clearBotFillTimer(pid);
                }
                const metaRaw = await client.hMGet(MM_META_HASH, current);
                const metaByUserId = new Map();
                current.forEach((pid, idx) => {
                    metaByUserId.set(pid, parseQueueMeta(metaRaw[idx]));
                });
                const botCount = Math.max(0, 4 - current.length);
                const { game } = await createTournamentWithPlayers(current, entryFee, metaByUserId, botCount);
                (0, metrics_1.incMetric)("matchmaking.matches.created.total");
                for (const pid of current) {
                    await client.hDel(MM_META_HASH, pid);
                    (0, io_1.getIO)().to(`user:${pid}`).emit("match_found", { gameId: game.id });
                }
                if (onMatch && current.includes(queuedUserId)) {
                    await onMatch({ gameId: game.id, playerIds: current });
                }
            }
            finally {
                const currentToken = await client.get(lockKey(entryFee));
                if (currentToken === token) {
                    await client.del(lockKey(entryFee));
                }
            }
        })().catch(() => undefined);
    }, BOT_FILL_DELAY_MS);
    botFillTimers.set(queuedUserId, timer);
}
async function tryMatchRedis(entryFee, queuedUserId, onMatch) {
    const client = await (0, redis_1.getRedisClient)();
    if (!client)
        return;
    const token = crypto_1.default.randomUUID();
    const acquired = await client.set(lockKey(entryFee), token, { NX: true, PX: 5000 });
    if (!acquired)
        return;
    try {
        while ((await client.lLen(queueKey(entryFee))) >= 4) {
            const players = await client.lRange(queueKey(entryFee), 0, 3);
            if (players.length < 4)
                break;
            await client.lTrim(queueKey(entryFee), 4, -1);
            for (const pid of players) {
                await client.del(userQueueKey(pid));
                clearBotFillTimer(pid);
            }
            const metaRaw = await client.hMGet(MM_META_HASH, players);
            const metaByUserId = new Map();
            players.forEach((pid, idx) => {
                metaByUserId.set(pid, parseQueueMeta(metaRaw[idx]));
            });
            const { game } = await createTournamentWithPlayers(players, entryFee, metaByUserId, 0);
            (0, metrics_1.incMetric)("matchmaking.matches.created.total");
            for (const pid of players) {
                await client.hDel(MM_META_HASH, pid);
                (0, io_1.getIO)().to(`user:${pid}`).emit("match_found", { gameId: game.id });
            }
            if (queuedUserId && onMatch && players.includes(queuedUserId)) {
                await onMatch({ gameId: game.id, playerIds: players });
            }
        }
    }
    finally {
        const current = await client.get(lockKey(entryFee));
        if (current === token) {
            await client.del(lockKey(entryFee));
        }
    }
}
function leaveQueue(userId, entryFee) {
    clearBotFillTimer(userId);
    if ((0, redis_1.hasRedisUrl)()) {
        void leaveQueueRedis(userId, entryFee).catch(() => undefined);
    }
    const keys = typeof entryFee === "number" ? [entryFee] : Object.keys(waitingQueues).map(Number);
    for (const key of keys) {
        if (!waitingQueues[key])
            continue;
        waitingQueues[key] = waitingQueues[key].filter((p) => p.userId !== userId);
    }
    pendingCallbacks.delete(userId);
}
function getMatchmakingHealth() {
    const redisEnabled = (0, redis_1.hasRedisUrl)();
    return {
        mode: redisEnabled ? "REDIS" : "MEMORY_SINGLE_INSTANCE",
        queueByEntryFee: redisEnabled
            ? "tracked_in_redis"
            : Object.fromEntries(Object.entries(waitingQueues).map(([fee, players]) => [fee, players.length])),
        pendingCallbacks: redisEnabled ? "local_only" : pendingCallbacks.size,
    };
}
async function forceFillWithBots(userId, entryFee = 0) {
    if (entryFee !== 0)
        return null;
    const redis = await (0, redis_1.getRedisClient)();
    if (redis) {
        const feeRaw = await redis.get(userQueueKey(userId));
        if (Number(feeRaw) !== entryFee)
            return null;
        const token = crypto_1.default.randomUUID();
        const acquired = await redis.set(lockKey(entryFee), token, { NX: true, PX: 5000 });
        if (!acquired)
            return null;
        try {
            const members = await redis.lRange(queueKey(entryFee), 0, -1);
            if (!members.includes(userId))
                return null;
            const others = members.filter((pid) => pid !== userId).slice(0, 3);
            const players = [userId, ...others];
            const botCount = Math.max(0, 4 - players.length);
            for (const pid of players) {
                await redis.lRem(queueKey(entryFee), 0, pid);
                await redis.del(userQueueKey(pid));
                clearBotFillTimer(pid);
            }
            const metaRaw = await redis.hMGet(MM_META_HASH, players);
            const metaByUserId = new Map();
            players.forEach((pid, idx) => {
                metaByUserId.set(pid, parseQueueMeta(metaRaw[idx]));
            });
            const { game } = await createTournamentWithPlayers(players, entryFee, metaByUserId, botCount);
            (0, metrics_1.incMetric)("matchmaking.matches.created.total");
            for (const pid of players) {
                await redis.hDel(MM_META_HASH, pid);
                (0, io_1.getIO)().to(`user:${pid}`).emit("match_found", { gameId: game.id });
            }
            return game.id;
        }
        finally {
            const current = await redis.get(lockKey(entryFee));
            if (current === token) {
                await redis.del(lockKey(entryFee));
            }
        }
    }
    const queue = waitingQueues[entryFee] || [];
    if (!queue.length)
        return null;
    if (!queue.some((p) => p.userId === userId))
        return null;
    const selected = [queue.find((p) => p.userId === userId), ...queue.filter((p) => p.userId !== userId).slice(0, 3)];
    const selectedIds = new Set(selected.map((p) => p.userId));
    waitingQueues[entryFee] = queue.filter((p) => !selectedIds.has(p.userId));
    const players = selected.map((p) => p.userId);
    const metaByUserId = new Map(selected.map((p) => [p.userId, p.meta]));
    const botCount = Math.max(0, 4 - players.length);
    const { game } = await createTournamentWithPlayers(players, entryFee, metaByUserId, botCount);
    (0, metrics_1.incMetric)("matchmaking.matches.created.total");
    for (const pid of players) {
        clearBotFillTimer(pid);
        const cb = pendingCallbacks.get(pid);
        if (cb) {
            await cb({ gameId: game.id, playerIds: players });
            pendingCallbacks.delete(pid);
        }
    }
    return game.id;
}
async function joinQueue(userId, entryFee, onMatch, meta) {
    const redis = await (0, redis_1.getRedisClient)();
    if (redis) {
        await leaveQueueRedis(userId, entryFee);
    }
    else {
        leaveQueue(userId, entryFee);
    }
    const user = await db_1.prisma.user.findUnique({
        where: { id: userId },
        include: { wallet: true },
    });
    if (!user)
        throw new Error("User not found");
    if (user.isFrozen)
        throw new Error("Account is frozen");
    if (!user.wallet)
        throw new Error("Wallet not found");
    if (user.wallet.isFrozen)
        throw new Error("Wallet is frozen");
    if (redis) {
        await redis
            .multi()
            .lRem(queueKey(entryFee), 0, userId)
            .rPush(queueKey(entryFee), userId)
            .set(userQueueKey(userId), String(entryFee), { EX: 3600 })
            .hSet(MM_META_HASH, userId, JSON.stringify(meta || {}))
            .exec();
        (0, metrics_1.incMetric)("matchmaking.queue.joined.total");
        await (0, gameplayLog_1.recordGameplayLog)(db_1.prisma, {
            userId,
            eventType: "QUEUE_JOINED",
            ip: meta?.ip ?? null,
            userAgent: meta?.userAgent ?? null,
            device: meta?.device ?? null,
            metadata: { entryFee, source: "socket" },
        });
        await tryMatchRedis(entryFee, userId, onMatch);
        await tryFillWithBotsRedis(entryFee, userId, onMatch);
        return;
    }
    if (!waitingQueues[entryFee])
        waitingQueues[entryFee] = [];
    pendingCallbacks.set(userId, onMatch);
    if (waitingQueues[entryFee].some((p) => p.userId === userId))
        return;
    waitingQueues[entryFee].push({ userId, meta });
    (0, metrics_1.incMetric)("matchmaking.queue.joined.total");
    await (0, gameplayLog_1.recordGameplayLog)(db_1.prisma, {
        userId,
        eventType: "QUEUE_JOINED",
        ip: meta?.ip ?? null,
        userAgent: meta?.userAgent ?? null,
        device: meta?.device ?? null,
        metadata: { entryFee, source: "socket" },
    });
    if (waitingQueues[entryFee].length >= 4) {
        const playersWithMeta = waitingQueues[entryFee].splice(0, 4);
        const players = playersWithMeta.map((p) => p.userId);
        const metaByUserId = new Map(playersWithMeta.map((p) => [p.userId, p.meta]));
        const { game } = await createTournamentWithPlayers(players, entryFee, metaByUserId, 0);
        (0, metrics_1.incMetric)("matchmaking.matches.created.total");
        for (const pid of players) {
            clearBotFillTimer(pid);
            const cb = pendingCallbacks.get(pid);
            if (!cb)
                continue;
            await cb({ gameId: game.id, playerIds: players });
            pendingCallbacks.delete(pid);
        }
    }
    else {
        scheduleBotFillMemory(entryFee, userId);
    }
}
async function createTournamentWithPlayers(players, entryFee, metaByUserId, botCount) {
    return await db_1.prisma
        .$transaction(async (tx) => {
        const tournament = await tx.tournament.create({
            data: {
                entryFee,
                maxPlayers: 4,
                status: "FULL",
            },
        });
        for (let i = 0; i < players.length; i++) {
            await tx.tournamentEntry.create({
                data: {
                    tournamentId: tournament.id,
                    userId: players[i],
                    team: i % 2 === 0 ? "TEAM_A" : "TEAM_B",
                },
            });
            await (0, gameplayLog_1.recordGameplayLog)(tx, {
                userId: players[i],
                tournamentId: tournament.id,
                eventType: "TOURNAMENT_ENTRY",
                ip: metaByUserId.get(players[i])?.ip ?? null,
                userAgent: metaByUserId.get(players[i])?.userAgent ?? null,
                device: metaByUserId.get(players[i])?.device ?? null,
                metadata: { entryFee, source: "matchmaking_queue" },
            });
        }
        const game = await tx.game.create({
            data: {
                tournamentId: tournament.id,
                status: "WAITING",
                phase: "DEALING",
                dealerSeat: 1,
                currentTurnSeat: 2,
                state: {},
            },
        });
        const totalSeats = players.length + botCount;
        for (let i = 0; i < totalSeats; i++) {
            const userId = i < players.length ? players[i] : null;
            await tx.gamePlayer.create({
                data: {
                    gameId: game.id,
                    userId,
                    team: i % 2 === 0 ? "TEAM_A" : "TEAM_B",
                    seat: i + 1,
                    isBot: userId === null,
                },
            });
            if (userId) {
                await (0, gameplayLog_1.recordGameplayLog)(tx, {
                    userId,
                    tournamentId: tournament.id,
                    gameId: game.id,
                    eventType: "GAME_MATCHED",
                    ip: metaByUserId.get(userId)?.ip ?? null,
                    userAgent: metaByUserId.get(userId)?.userAgent ?? null,
                    device: metaByUserId.get(userId)?.device ?? null,
                    metadata: { entryFee, source: "matchmaking_queue" },
                });
            }
        }
        return { tournament, game };
    })
        .then(async ({ tournament, game }) => {
        const initialState = await (0, engine_1.startGame)(game.id);
        return { tournament, game, initialState };
    });
}
