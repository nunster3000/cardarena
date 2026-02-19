import { Prisma, PrismaClient } from "@prisma/client";

type DbClient = PrismaClient | Prisma.TransactionClient;

type GameplayLogInput = {
  userId: string;
  eventType: string;
  tournamentId?: string | null;
  gameId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  device?: string | null;
  metadata?: Prisma.InputJsonValue;
};

export async function recordGameplayLog(db: DbClient, input: GameplayLogInput) {
  await db.gameplayLog.create({
    data: {
      userId: input.userId,
      eventType: input.eventType,
      tournamentId: input.tournamentId ?? null,
      gameId: input.gameId ?? null,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      device: input.device ?? null,
      metadata: input.metadata,
    },
  });
}

