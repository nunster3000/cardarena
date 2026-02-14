import { Server, Socket } from "socket.io";
import { startGame } from "../game/engine";
import { prisma } from "../db";
import { triggerBotMove } from "../game/bot";
import { joinQueue } from "../game/matchmaking";

const activeConnections = new Map<string, { gameId: string; seat: number }>();
const disconnectTimers = new Map<string, NodeJS.Timeout>();
const userSockets = new Map<string, string>(); // userId -> socketId
const socketRateLimit = new Map<string, { count: number; timestamp: number }>();

const MAX_EVENTS_PER_SECOND = 10;

export function registerGameSockets(io: Server) {
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

  io.on("connection", (socket: Socket) => {
    console.log("Player connected:", socket.id);

    socket.on("register_user", ({ userId }) => {
      if (!checkRateLimit(socket.id)) {
        return socket.emit("error", { message: "Rate limit exceeded" });
      }

      userSockets.set(userId, socket.id);
    });

    socket.on("find_table", async ({ userId, entryFee }) => {
      if (!checkRateLimit(socket.id)) {
        return socket.emit("error", { message: "Rate limit exceeded" });
      }

      await joinQueue(userId, entryFee, async ({ gameId, playerIds }) => {
        // Notify all 4 players they have a game
        for (const pid of playerIds) {
          const sid = userSockets.get(pid);
          if (sid) {
            io.to(sid).emit("match_found", { gameId });
          }
        }
      });
    });

    socket.on("place_bid", async ({ gameId, userId, bid }) => {
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

    socket.on("play_card", async ({ gameId, userId, card }) => {
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

    socket.on("join_game", async ({ gameId, userId }) => {
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

      // If reconnecting -> cancel timer
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
      for (const [uid, sid] of userSockets.entries()) {
        if (sid === socket.id) userSockets.delete(uid);
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

      // Start 30-second timer
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
