import { Router } from "express";
import { prisma } from "../db";
import { getMatchmakingHealth } from "../game/matchmaking";
import { getPartyHealth } from "./party";
import { validateRuntimeConfig } from "../config/runtime";

const router = Router();

router.get("/", async (_req, res) => {
  let database = "up";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    database = "down";
  }

  const runtime = validateRuntimeConfig({ logWarnings: false });
  const ready = database === "up";

  const payload = {
    status: ready ? "ok" : "degraded",
    service: "cardarena-backend",
    timestamp: new Date().toISOString(),
    ready,
    checks: {
      database,
    },
    runtime,
    realtime: {
      matchmaking: getMatchmakingHealth(),
      party: getPartyHealth(),
    },
  };

  res.status(200).json(payload);
});

router.get("/ready", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ ready: true });
  } catch {
    res.status(503).json({ ready: false });
  }
});

export default router;
