import { Role } from "@prisma/client";
import jwt from "jsonwebtoken";
import { Server, Socket } from "socket.io";
import { prisma } from "../db";
import { triggerBotMove } from "../game/bot";
import { startGame } from "../game/engine";
import { joinQueue } from "../game/matchmaking";

type AuthPayload = {
  userId: string;
  role: Role;
  iat: number;
  exp: number;
};

type AuthedSocket = Socket & {
  data: {
    userId?: string;
    userRole?: Role;
  };
};

const activeConnections = new Map<string, { gameId: string; seat: number }>();
const disconnectTimers = new Map<string, NodeJS.Timeout>();
const userSockets = new Map<string, string>();
const userConnectionCounts = new Map<string, number>();
const socketRateLimit = new Map<string, { count: number; timestamp: number }>();

const MAX_EVENTS_PER_SECOND = 10;

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (secret) return secret;

  if (process.env.NODE_ENV === "test") {
    return "test_secret";
  }

  throw new Error("JWT_SECRET is not defined");
}

export function registerGameSockets(io: Server) {
  const jwtSecret = getJwtSecret();

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) {
        return next(new Error("Missing socket auth token"));
      }

      const payload = jwt.verify(token, jwtSecret) as AuthPayload;
      (socket as AuthedSocket).data.userId = payload.userId;
      (socket as AuthedSocket).data.userRole = payload.role;
      next();
    } catch {
      next(new Error("Invalid socket auth token"));
    }
  });

  function checkRateLimit(socketId: string) {
    const now = Date.now();
    const data = socketRateLimit.get(socketId);

    if (!data) {
      socketRateLimit.set(socketId, { count: 1, timestamp: now });
      return true;
    }

    if (now - data.timestamp > 1000) {
      socketRateLimit.set(socketId, { count: 1, timestamp: now });
      return true;
    }

    if (data.count >= MAX_EVENTS_PER_SECOND) {
      return false;
    }

    data.count++;
    return true;
  }

  io.on("connection", (rawSocket: Socket) => {
    const socket = rawSocket as AuthedSocket;
    const userId = socket.data.userId;

    if (!userId) {
      socket.disconnect(true);
      return;
    }

    console.log("Player connected:", socket.id);
    userSockets.set(userId, socket.id);
    const currentCount = userConnectionCounts.get(userId) ?? 0;
    userConnectionCounts.set(userId, currentCount + 1);
    prisma.user
      .update({
        where: { id: userId },
        data: { isOnline: true, lastSeenAt: new Date() },
      })
      .catch(() => undefined);

    socket.on("find_table", async ({ entryFee }) => {
      if (!checkRateLimit(socket.id)) {
        return socket.emit("error", { message: "Rate limit exceeded" });
      }

      try {
        await joinQueue(userId, entryFee, async ({ gameId }) => {
          const sid = userSockets.get(userId);
          if (sid) {
            io.to(sid).emit("match_found", { gameId });
          }
        });
      } catch (err: any) {
        socket.emit("error", { message: err?.message ?? "Unable to join queue" });
      }
    });

    socket.on("place_bid", async ({ gameId, bid }) => {
      if (!checkRateLimit(socket.id)) {
        return socket.emit("error", { message: "Rate limit exceeded" });
      }

      try {
        const gp = await prisma.gamePlayer.findFirst({ where: { gameId, userId } });
        if (!gp) return socket.emit("error", { message: "Not a player in this game" });

        const { placeBid } = await import("../game/bid");
        await placeBid(gameId, gp.seat, bid);
      } catch (err: any) {
        if (err?.message === "Game action already in progress") {
          socket.emit("error", { message: "Action already in progress. Please retry." });
          return;
        }

        socket.emit("error", { message: err?.message ?? "Unable to place bid" });
      }
    });

    socket.on("play_card", async ({ gameId, card }) => {
      if (!checkRateLimit(socket.id)) {
        return socket.emit("error", { message: "Rate limit exceeded" });
      }

      try {
        const gp = await prisma.gamePlayer.findFirst({ where: { gameId, userId } });
        if (!gp) return socket.emit("error", { message: "Not a player in this game" });

        const { playCard } = await import("../game/play");
        await playCard(gameId, gp.seat, card);
      } catch (err: any) {
        if (err?.message === "Game action already in progress") {
          socket.emit("error", { message: "Action already in progress. Please retry." });
          return;
        }

        socket.emit("error", { message: err?.message ?? "Unable to play card" });
      }
    });

    socket.on("join_game", async ({ gameId }) => {
      if (!checkRateLimit(socket.id)) {
        return socket.emit("error", { message: "Rate limit exceeded" });
      }

      socket.join(gameId);

      const player = await prisma.gamePlayer.findFirst({
        where: {
          gameId,
          userId,
        },
      });

      if (!player) {
        socket.emit("error", { message: "Player not found in game" });
        return;
      }

      activeConnections.set(socket.id, {
        gameId,
        seat: player.seat,
      });

      if (disconnectTimers.has(player.id)) {
        clearTimeout(disconnectTimers.get(player.id)!);
        disconnectTimers.delete(player.id);
      }

      await prisma.gamePlayer.update({
        where: { id: player.id },
        data: {
          disconnectedAt: null,
          replacedByBot: false,
        },
      });

      console.log(`User ${userId} joined game ${gameId}`);
    });

    socket.on("start_game", async ({ gameId }) => {
      if (!checkRateLimit(socket.id)) {
        return socket.emit("error", { message: "Rate limit exceeded" });
      }

      try {
        const state = await startGame(gameId);
        io.to(gameId).emit("game_started", state);
      } catch (err) {
        console.error(err);
        socket.emit("error", { message: "Unable to start game" });
      }
    });

    socket.on("disconnect", async () => {
      userSockets.delete(userId);
      const count = userConnectionCounts.get(userId) ?? 0;
      const next = Math.max(0, count - 1);
      userConnectionCounts.set(userId, next);
      if (next === 0) {
        await prisma.user
          .update({
            where: { id: userId },
            data: { isOnline: false, lastSeenAt: new Date() },
          })
          .catch(() => undefined);
      }

      const connection = activeConnections.get(socket.id);
      if (!connection) return;

      const { gameId, seat } = connection;

      const player = await prisma.gamePlayer.findFirst({
        where: { gameId, seat },
      });

      if (!player) return;

      console.log(`Player seat ${seat} disconnected`);

      await prisma.gamePlayer.update({
        where: { id: player.id },
        data: {
          disconnectedAt: new Date(),
        },
      });

      const timer = setTimeout(async () => {
        console.log(`Replacing seat ${seat} with bot`);

        await prisma.gamePlayer.update({
          where: { id: player.id },
          data: {
            isBot: true,
            replacedByBot: true,
          },
        });

        await triggerBotMove(gameId);
        disconnectTimers.delete(player.id);
      }, 30 * 1000);

      disconnectTimers.set(player.id, timer);
      activeConnections.delete(socket.id);
    });
  });
}
