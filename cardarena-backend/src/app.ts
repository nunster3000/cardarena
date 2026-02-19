import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import { logger } from "./utils/logger";

import healthRouter from "./routes/health";
import usersRouter from "./routes/users";
import authRouter from "./routes/auth";
import cardsRouter from "./routes/cards";
import adminRouter from "./routes/admin";
import depositRoutes from "./routes/deposits";
import withdrawalRoutes from "./routes/withdrawals";
import connectRoutes from "./routes/connect";
import tournamentsRouter from "./routes/tournaments";
import partyRouter from "./routes/party";
import gamesRouter from "./routes/games";
import adminFinanceRoutes from "./routes/adminFinance";
import adminRiskRoutes from "./routes/adminRisk";
import webhookRouter from "./routes/webhook";
import withdrawalProcessorRouter from "./routes/withdrawalProcessor";
import { errorHandler } from "./middleware/errorHandler";
import { metricsHandler, metricsMiddleware } from "./monitoring/metrics";

export const app = express();
app.disable("etag");
const trustProxySetting = process.env.TRUST_PROXY
  ? process.env.TRUST_PROXY === "true"
    ? 1
    : process.env.TRUST_PROXY
  : process.env.NODE_ENV === "production"
    ? 1
    : false;
app.set("trust proxy", trustProxySetting as any);

app.use(pinoHttp({ logger }));
app.use(metricsMiddleware);

app.use(
  "/api/v1/webhook",
  express.raw({ type: "application/json" }),
  webhookRouter
);

app.use(express.json());
app.use(helmet());

const allowedOrigins = (
  process.env.ALLOWED_ORIGINS ||
  process.env.FRONTEND_BASE_URL ||
  "http://localhost:3001"
)
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const safeAllowedOrigins =
  process.env.NODE_ENV === "production" &&
  !process.env.ALLOWED_ORIGINS &&
  !process.env.FRONTEND_BASE_URL
    ? []
    : allowedOrigins;

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && safeAllowedOrigins.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Vary", "Origin");
    res.header("Access-Control-Allow-Credentials", "true");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

const authLimiter = rateLimit({
  windowMs: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  max: Number(process.env.AUTH_RATE_LIMIT_MAX || 60),
  standardHeaders: true,
  legacyHeaders: false,
});

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MAX || 2000),
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);
app.use("/api/v1/auth/login", authLimiter);
app.use("/api/v1/auth/register", authLimiter);
app.use("/api/v1/auth/forgot-password", authLimiter);
app.use("/api/v1/auth/reset-password", authLimiter);
app.use("/api/v1/auth/resend-admin-verification", authLimiter);

app.use("/health", healthRouter);
app.use("/api/v1/users", usersRouter);
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/cards", cardsRouter);
app.use("/api/v1/admin", adminRouter);
app.use("/api/deposits", depositRoutes);
app.use("/api/v1/deposits", depositRoutes);
app.use("/api/v1/withdrawals", withdrawalRoutes);
app.use("/api/connect", connectRoutes);
app.use("/api/v1/connect", connectRoutes);
app.use("/api/v1/tournaments", tournamentsRouter);
app.use("/api/v1/party", partyRouter);
app.use("/api/v1/games", gamesRouter);
app.use("/api/admin/finance", adminFinanceRoutes);
app.use("/api/v1/admin/finance", adminFinanceRoutes);
app.use("/api/v1/admin/risk", adminRiskRoutes);
app.use("/api/v1/withdrawal-processor", withdrawalProcessorRouter);
app.get("/metrics", metricsHandler);

app.use(errorHandler);

