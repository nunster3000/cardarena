import { prisma } from "../db";
import { getIO } from "../socket/io";
import { serializeGameStateForSeat } from "./stateView";

export async function emitGameStateForGame(gameId: string, rawState?: unknown) {
  const [players, game] = await Promise.all([
    prisma.gamePlayer.findMany({
      where: { gameId },
      select: { userId: true, seat: true },
    }),
    rawState === undefined
      ? prisma.game.findUnique({
          where: { id: gameId },
          select: { state: true },
        })
      : Promise.resolve(null),
  ]);

  const state = rawState ?? game?.state;
  if (!state) return;

  const seatByUserId = new Map<string, number>();
  for (const p of players) {
    if (p.userId) seatByUserId.set(p.userId, p.seat);
  }

  const io = getIO();
  const sockets = await io.in(gameId).fetchSockets();
  for (const socket of sockets) {
    const uid = (socket.data?.userId as string | undefined) || "";
    const seat = seatByUserId.get(uid);
    if (!seat) continue;
    socket.emit("game_state", serializeGameStateForSeat(state, seat));
  }
}

