import dotenv from "dotenv";
dotenv.config();

import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";

import authRouter from "./routes/auth";
import healthRouter from "./routes/health";
import usersRouter from "./routes/users";
import cardsRouter from "./routes/cards";
import adminRouter from "./routes/admin";
import webhookRouter from "./routes/webhook";
import depositRoutes from "./routes/deposits";
import withdrawalRoutes from "./routes/withdrawals";
import withdrawalProcessorRoute from "./routes/withdrawalProcessor";
import connectRoutes from "./routes/connect";
import tournamentsRouter from "./routes/tournaments";
import adminFinanceRoutes from "./routes/adminFinance";

import { errorHandler } from "./middleware/errorHandler";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import { logger } from "./utils/logger";

import { processPendingWithdrawals } from "./config/withdrawalProcessor";
import { startCronJobs } from "./config/cron";
import { registerGameSockets } from "./socket/gameSocket";
import { setIO } from "./socket/io";
import { recoverActiveGames } from "./game/recovery";

const app = express();
const server = createServer(app);

export const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

setIO(io);

// ✅ Register all socket logic in one place
registerGameSockets(io);

// --------------------
// Middleware
// --------------------
app.use(pinoHttp({ logger }));

app.use(
  "/api/v1/webhook",
  express.raw({ type: "application/json" }),
  webhookRouter
);

app.use(express.json());
app.use(helmet());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: {
    success: false,
    error: "Too many requests. Please try again later.",
  },
});

app.use(limiter);

// --------------------
// Routes
// --------------------
app.use("/health", healthRouter);
app.use("/api/v1/users", usersRouter);
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/cards", cardsRouter);
app.use("/api/v1/admin", adminRouter);
app.use("/api/deposits", depositRoutes);
app.use("/api/v1/withdrawals", withdrawalRoutes);
app.use("/api/admin/withdrawals", withdrawalProcessorRoute);
app.use("/api/connect", connectRoutes);
app.use("/api/v1/tournaments", tournamentsRouter);
app.use("/api/admin/finance", adminFinanceRoutes);

app.use(errorHandler);

// --------------------
// Automatic Withdrawal Processor
// --------------------
let isProcessingWithdrawals = false;

setInterval(async () => {
  if (isProcessingWithdrawals) {
    console.log("Skipping withdrawal processor (already running).");
    return;
  }

  isProcessingWithdrawals = true;

  try {
    console.log("Running automatic withdrawal processor...");
    await processPendingWithdrawals();
  } catch (error) {
    console.error("Withdrawal processor failed:", error);
  } finally {
    isProcessingWithdrawals = false;
  }
}, 3 * 60 * 1000); // every 3 minutes

// --------------------
// Start Server
// --------------------
const PORT = process.env.PORT || 3000;

server.listen(PORT, async () => {
  console.log(`CardArena backend running on port ${PORT}`);
  await recoverActiveGames();
});

// Start additional cron jobs
startCronJobs();
