// src/game/disconnect.ts

import { prisma } from "../db";
import { triggerBotMoveSafely } from "./bot";

const DISCONNECT_TIMEOUT = 30 * 1000; // 30 seconds
const MAX_DISCONNECTS = 5;

const pendingReconnects = new Map<string, NodeJS.Timeout>();

export async function handleDisconnect(gameId: string, userId: string) {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: { players: true },
  });

  if (!game) return;

  const player = game.players.find(p => p.userId === userId);
  if (!player) return;

  // Pause game
  await prisma.game.update({
    where: { id: gameId },
    data: { status: "PAUSED" },
  });

  const timeout = setTimeout(async () => {
    await replaceWithBot(gameId, player.id, userId);
    pendingReconnects.delete(userId);
  }, DISCONNECT_TIMEOUT);

  pendingReconnects.set(userId, timeout);
}

export async function handleReconnect(gameId: string, userId: string) {
  const timeout = pendingReconnects.get(userId);
  if (timeout) {
    clearTimeout(timeout);
    pendingReconnects.delete(userId);
  }

  await prisma.game.update({
    where: { id: gameId },
    data: { status: "ACTIVE" },
  });
}

async function replaceWithBot(gameId: string, gamePlayerId: string, userId: string) {
  await prisma.$transaction(async (tx) => {

    await tx.gamePlayer.update({
      where: { id: gamePlayerId },
      data: {
        isBot: true,
        replacedByBot: true,
      },
    });

    const user = await tx.user.findUnique({ where: { id: userId } });

    if (user) {
      const newCount = user.disconnectCount + 1;

      await tx.user.update({
        where: { id: userId },
        data: {
          disconnectCount: newCount,
          isSuspended: newCount >= MAX_DISCONNECTS,
          lastDisconnectAt: new Date(),
        },
      });
    }

    await tx.game.update({
      where: { id: gameId },
      data: { status: "ACTIVE" },
    });
  });

  await triggerBotMoveSafely(gameId, "disconnect.replaceWithBot");
}
