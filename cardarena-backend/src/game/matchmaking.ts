import { prisma } from "../db";
import { startGame } from "./engine";
import { recordGameplayLog } from "../lib/gameplayLog";
import { incMetric } from "../monitoring/metrics";
import { getIO } from "../socket/io";
import { getRedisClient, hasRedisUrl } from "../lib/redis";
import crypto from "crypto";

type QueueMeta = {
  ip?: string | null;
  userAgent?: string | null;
  device?: string | null;
};

type MatchCallback = (data: { gameId: string; playerIds: string[] }) => Promise<void> | void;

const waitingQueues: Record<number, Array<{ userId: string; meta?: QueueMeta }>> = {};
// key = entryFee, value = array of userIds
const pendingCallbacks = new Map<string, MatchCallback>();

const MM_QUEUE_PREFIX = "mm:queue:";
const MM_USER_QUEUE_PREFIX = "mm:user:";
const MM_META_HASH = "mm:meta";
const MM_MATCH_LOCK_PREFIX = "mm:lock:";

function queueKey(entryFee: number) {
  return `${MM_QUEUE_PREFIX}${entryFee}`;
}

function userQueueKey(userId: string) {
  return `${MM_USER_QUEUE_PREFIX}${userId}`;
}

function lockKey(entryFee: number) {
  return `${MM_MATCH_LOCK_PREFIX}${entryFee}`;
}

async function leaveQueueRedis(userId: string, entryFee?: number) {
  const client = await getRedisClient();
  if (!client) return;

  const knownFeeRaw = entryFee ?? Number(await client.get(userQueueKey(userId)));
  if (Number.isFinite(knownFeeRaw)) {
    await client.lRem(queueKey(Number(knownFeeRaw)), 0, userId);
  }

  await Promise.all([client.del(userQueueKey(userId)), client.hDel(MM_META_HASH, userId)]);
}

async function tryMatchRedis(entryFee: number, queuedUserId?: string, onMatch?: MatchCallback) {
  const client = await getRedisClient();
  if (!client) return;

  const token = crypto.randomUUID();
  const acquired = await client.set(lockKey(entryFee), token, { NX: true, PX: 5000 });
  if (!acquired) return;

  try {
    while ((await client.lLen(queueKey(entryFee))) >= 4) {
      const players = await client.lRange(queueKey(entryFee), 0, 3);
      if (players.length < 4) break;

      await client.lTrim(queueKey(entryFee), 4, -1);
      for (const pid of players) {
        await client.del(userQueueKey(pid));
      }

      const metaRaw = await client.hMGet(MM_META_HASH, players);
      const metaByUserId = new Map<string, QueueMeta | undefined>();
      players.forEach((pid: string, idx: number) => {
        const raw = metaRaw[idx];
        if (!raw) {
          metaByUserId.set(pid, undefined);
          return;
        }
        try {
          metaByUserId.set(pid, JSON.parse(raw) as QueueMeta);
        } catch {
          metaByUserId.set(pid, undefined);
        }
      });

      const { game } = await createTournamentWithPlayers(players, entryFee, metaByUserId);
      incMetric("matchmaking.matches.created.total");

      for (const pid of players) {
        await client.hDel(MM_META_HASH, pid);
        getIO().to(`user:${pid}`).emit("match_found", { gameId: game.id });
      }

      if (queuedUserId && onMatch && players.includes(queuedUserId)) {
        await onMatch({ gameId: game.id, playerIds: players });
      }
    }
  } finally {
    const current = await client.get(lockKey(entryFee));
    if (current === token) {
      await client.del(lockKey(entryFee));
    }
  }
}

export function leaveQueue(userId: string, entryFee?: number) {
  if (hasRedisUrl()) {
    void leaveQueueRedis(userId, entryFee).catch(() => undefined);
  }

  const keys = typeof entryFee === "number" ? [entryFee] : Object.keys(waitingQueues).map(Number);
  for (const key of keys) {
    if (!waitingQueues[key]) continue;
    waitingQueues[key] = waitingQueues[key].filter((p) => p.userId !== userId);
  }
  pendingCallbacks.delete(userId);
}

export function getMatchmakingHealth() {
  const redisEnabled = hasRedisUrl();
  return {
    mode: redisEnabled ? "REDIS" : "MEMORY_SINGLE_INSTANCE",
    queueByEntryFee: redisEnabled
      ? "tracked_in_redis"
      : Object.fromEntries(Object.entries(waitingQueues).map(([fee, players]) => [fee, players.length])),
    pendingCallbacks: redisEnabled ? "local_only" : pendingCallbacks.size,
  };
}

export async function joinQueue(
  userId: string,
  entryFee: number,
  onMatch: MatchCallback,
  meta?: QueueMeta
) {
  const redis = await getRedisClient();
  if (redis) {
    await leaveQueueRedis(userId, entryFee);
  } else {
    leaveQueue(userId, entryFee);
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { wallet: true },
  });

  if (!user) throw new Error("User not found");
  if (user.isFrozen) throw new Error("Account is frozen");
  if (!user.wallet) throw new Error("Wallet not found");
  if (user.wallet.isFrozen) throw new Error("Wallet is frozen");

  if (redis) {
    await redis.multi()
      .lRem(queueKey(entryFee), 0, userId)
      .rPush(queueKey(entryFee), userId)
      .set(userQueueKey(userId), String(entryFee), { EX: 3600 })
      .hSet(MM_META_HASH, userId, JSON.stringify(meta || {}))
      .exec();

    incMetric("matchmaking.queue.joined.total");

    await recordGameplayLog(prisma, {
      userId,
      eventType: "QUEUE_JOINED",
      ip: meta?.ip ?? null,
      userAgent: meta?.userAgent ?? null,
      device: meta?.device ?? null,
      metadata: { entryFee, source: "socket" },
    });

    await tryMatchRedis(entryFee, userId, onMatch);
    return;
  }

  if (!waitingQueues[entryFee]) waitingQueues[entryFee] = [];
  pendingCallbacks.set(userId, onMatch);

  // prevent duplicates
  if (waitingQueues[entryFee].some((p) => p.userId === userId)) return;

  waitingQueues[entryFee].push({ userId, meta });
  incMetric("matchmaking.queue.joined.total");

  await recordGameplayLog(prisma, {
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
    const { game } = await createTournamentWithPlayers(players, entryFee, metaByUserId);
    incMetric("matchmaking.matches.created.total");
    for (const pid of players) {
      const cb = pendingCallbacks.get(pid);
      if (!cb) continue;
      await cb({ gameId: game.id, playerIds: players });
      pendingCallbacks.delete(pid);
    }
  }
}

async function createTournamentWithPlayers(
  players: string[],
  entryFee: number,
  metaByUserId: Map<string, QueueMeta | undefined>
) {
  return await prisma.$transaction(async (tx) => {
    // 1️⃣ Create tournament
    const tournament = await tx.tournament.create({
      data: {
        entryFee,
        maxPlayers: 4,
        status: "FULL",
      },
    });

    // 2️⃣ Create entries
    for (let i = 0; i < players.length; i++) {
      await tx.tournamentEntry.create({
        data: {
          tournamentId: tournament.id,
          userId: players[i],
          team: i % 2 === 0 ? "TEAM_A" : "TEAM_B",
        },
      });
      await recordGameplayLog(tx, {
        userId: players[i],
        tournamentId: tournament.id,
        eventType: "TOURNAMENT_ENTRY",
        ip: metaByUserId.get(players[i])?.ip ?? null,
        userAgent: metaByUserId.get(players[i])?.userAgent ?? null,
        device: metaByUserId.get(players[i])?.device ?? null,
        metadata: { entryFee, source: "matchmaking_queue" },
      });
    }

    // 3️⃣ Create game record
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

    // 4️⃣ Create GamePlayer seats
    for (let i = 0; i < players.length; i++) {
      await tx.gamePlayer.create({
        data: {
          gameId: game.id,
          userId: players[i],
          team: i % 2 === 0 ? "TEAM_A" : "TEAM_B",
          seat: i + 1,
        },
      });
      await recordGameplayLog(tx, {
        userId: players[i],
        tournamentId: tournament.id,
        gameId: game.id,
        eventType: "GAME_MATCHED",
        ip: metaByUserId.get(players[i])?.ip ?? null,
        userAgent: metaByUserId.get(players[i])?.userAgent ?? null,
        device: metaByUserId.get(players[i])?.device ?? null,
        metadata: { entryFee, source: "matchmaking_queue" },
      });
    }

    return { tournament, game };
  }).then(async ({ tournament, game }) => {
    // 5️⃣ Start the game AFTER transaction completes
    const initialState = await startGame(game.id);

    return { tournament, game, initialState };
  });
}
