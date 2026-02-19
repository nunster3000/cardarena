import { Router } from "express";
import { GamePhase, GameStatus } from "@prisma/client";
import { prisma } from "../db";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { startGame } from "../game/engine";
import { submitBid } from "../game/bid";
import { playCard } from "../game/play";
import { serializeGameStateForSeat } from "../game/stateView";
import { incMetric } from "../monitoring/metrics";
import { forceFillWithBots, joinQueue, leaveQueue } from "../game/matchmaking";

const router = Router();
router.use(authMiddleware);

async function getPlayerSeat(gameId: string, userId: string) {
  const player = await prisma.gamePlayer.findFirst({
    where: { gameId, userId },
    select: { id: true, seat: true },
  });
  if (!player) throw new AppError("Not a player in this game", 403);
  return player.seat;
}

router.get("/me/active", async (req: AuthRequest, res, next) => {
  try {
    incMetric("games.me_active.requests.total");
    const gp = await prisma.gamePlayer.findFirst({
      where: {
        userId: req.userId!,
        game: {
          status: { in: [GameStatus.WAITING, GameStatus.ACTIVE] },
        },
      },
      include: {
        game: {
          select: {
            id: true,
            status: true,
            phase: true,
            tournamentId: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!gp?.game) {
      return res.json({ data: null });
    }

    res.json({ data: gp.game });
  } catch (err) {
    next(err);
  }
});

router.post("/queue/free", async (req: AuthRequest, res, next) => {
  try {
    await joinQueue(
      req.userId!,
      0,
      async () => undefined,
      {
        ip: req.ip || null,
        userAgent: (req.headers["user-agent"] as string | undefined) || null,
        device:
          (req.headers["sec-ch-ua-platform"] as string | undefined) ||
          (req.headers["user-agent"] as string | undefined) ||
          null,
      }
    );
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.post("/queue/free/cancel", async (req: AuthRequest, res, next) => {
  try {
    leaveQueue(req.userId!, 0);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.post("/queue/free/fill-bots", async (req: AuthRequest, res, next) => {
  try {
    const gameId = await forceFillWithBots(req.userId!, 0);
    res.json({ success: true, gameId });
  } catch (err) {
    next(err);
  }
});

router.get("/:gameId", async (req: AuthRequest, res, next) => {
  try {
    incMetric("games.fetch.requests.total");
    const { gameId } = req.params;
    const playerSeat = await getPlayerSeat(gameId, req.userId!);

    const game = await prisma.game.findUnique({
      where: { id: gameId },
      include: {
        players: {
          select: {
            seat: true,
            isBot: true,
            user: { select: { id: true, username: true } },
          },
          orderBy: { seat: "asc" },
        },
      },
    });

    if (!game) throw new AppError("Game not found", 404);

    res.json({
      data: {
        id: game.id,
        status: game.status,
        phase: game.phase,
        tournamentId: game.tournamentId,
        state: serializeGameStateForSeat(game.state, playerSeat),
        playerSeat,
        players: game.players,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post("/:gameId/start", async (req: AuthRequest, res, next) => {
  try {
    incMetric("games.start.requests.total");
    const { gameId } = req.params;
    const seat = await getPlayerSeat(gameId, req.userId!);

    const existing = await prisma.game.findUnique({
      where: { id: gameId },
      select: { id: true, phase: true, status: true },
    });
    if (!existing) throw new AppError("Game not found", 404);

    if (
      existing.status === GameStatus.ACTIVE &&
      existing.phase !== GamePhase.WAITING
    ) {
      return res.json({ success: true, alreadyStarted: true });
    }

    const state = await startGame(gameId);
    res.json({ success: true, state: serializeGameStateForSeat(state, seat) });
  } catch (err) {
    next(err);
  }
});

router.post("/:gameId/bid", async (req: AuthRequest, res, next) => {
  try {
    incMetric("games.bid.requests.total");
    const { gameId } = req.params;
    const bid = Number(req.body.bid);
    if (Number.isNaN(bid)) throw new AppError("bid must be a number", 400);

    const seat = await getPlayerSeat(gameId, req.userId!);
    const state = await submitBid(gameId, seat, bid);
    res.json({ success: true, state: serializeGameStateForSeat(state, seat) });
  } catch (err) {
    next(err);
  }
});

router.post("/:gameId/play", async (req: AuthRequest, res, next) => {
  try {
    incMetric("games.play.requests.total");
    const { gameId } = req.params;
    const suit = String(req.body.suit || "").toUpperCase();
    const rank = Number(req.body.rank);
    if (!suit || Number.isNaN(rank)) {
      throw new AppError("suit and rank are required", 400);
    }

    const seat = await getPlayerSeat(gameId, req.userId!);
    const state = await playCard(gameId, seat, { suit, rank: String(rank) });
    res.json({ success: true, state: serializeGameStateForSeat(state, seat) });
  } catch (err) {
    next(err);
  }
});

export default router;
