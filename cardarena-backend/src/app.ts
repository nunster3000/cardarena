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
import adminFinanceRoutes from "./routes/adminFinance";
import webhookRouter from "./routes/webhook";
import { errorHandler } from "./middleware/errorHandler";

export const app = express();

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
});

app.use(limiter);

app.use("/health", healthRouter);
app.use("/api/v1/users", usersRouter);
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/cards", cardsRouter);
app.use("/api/v1/admin", adminRouter);
app.use("/api/deposits", depositRoutes);
app.use("/api/v1/withdrawals", withdrawalRoutes);
app.use("/api/connect", connectRoutes);
app.use("/api/v1/tournaments", tournamentsRouter);
app.use("/api/admin/finance", adminFinanceRoutes);

app.use(errorHandler);

