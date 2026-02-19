import dotenv from "dotenv";
dotenv.config();

import { createServer } from "http";
import { Server } from "socket.io";
import { app } from "./app";
import { registerGameSockets } from "./socket/gameSocket";
import { setIO } from "./socket/io";
import { startCronJobs } from "./config/cron";
import { validateRuntimeConfig } from "./config/runtime";
import { logger } from "./utils/logger";

const allowedOrigins = (
  process.env.ALLOWED_ORIGINS ||
  process.env.FRONTEND_BASE_URL ||
  "http://localhost:3001"
)
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const server = createServer(app);

export const io = new Server(server, {
  cors: {
    origin: allowedOrigins.length ? allowedOrigins : false,
    credentials: true,
  },
});

const PORT = process.env.PORT || 3000;

async function configureSocketAdapter() {
  if (!process.env.REDIS_URL) return;

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createAdapter } = require("@socket.io/redis-adapter");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createClient } = require("redis");

  const pubClient = createClient({ url: process.env.REDIS_URL });
  const subClient = pubClient.duplicate();

  pubClient.on("error", (err: unknown) => {
    logger.error({ err }, "Redis pub client error");
  });
  subClient.on("error", (err: unknown) => {
    logger.error({ err }, "Redis sub client error");
  });

  try {
    await Promise.all([pubClient.connect(), subClient.connect()]);
    io.adapter(createAdapter(pubClient, subClient));
    logger.info("Socket.IO Redis adapter enabled");
  } catch (err) {
    logger.error({ err }, "Failed to initialize Socket.IO Redis adapter");
    await Promise.allSettled([pubClient.quit(), subClient.quit()]);
    if (process.env.REQUIRE_DURABLE_QUEUE === "true") throw err;
  }
}

async function bootstrap() {
  await configureSocketAdapter();

  setIO(io);
  registerGameSockets(io);
  startCronJobs();

  const runtime = validateRuntimeConfig();
  if (process.env.REQUIRE_DURABLE_QUEUE === "true" && runtime.queueMode !== "REDIS") {
    throw new Error("REQUIRE_DURABLE_QUEUE is true but REDIS_URL is not configured.");
  }
  logger.info(
    { queueMode: runtime.queueMode, env: runtime.env, warningCount: runtime.warnings.length },
    "Runtime initialized"
  );

  server.listen(PORT, () => {
    console.log(`CardArena backend running on port ${PORT}`);
  });
}

bootstrap().catch((err) => {
  logger.error({ err }, "Fatal startup error");
  process.exit(1);
});
