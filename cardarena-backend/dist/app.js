"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
const express_1 = __importDefault(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const pino_http_1 = __importDefault(require("pino-http"));
const logger_1 = require("./utils/logger");
const health_1 = __importDefault(require("./routes/health"));
const users_1 = __importDefault(require("./routes/users"));
const auth_1 = __importDefault(require("./routes/auth"));
const cards_1 = __importDefault(require("./routes/cards"));
const admin_1 = __importDefault(require("./routes/admin"));
const deposits_1 = __importDefault(require("./routes/deposits"));
const withdrawals_1 = __importDefault(require("./routes/withdrawals"));
const connect_1 = __importDefault(require("./routes/connect"));
const tournaments_1 = __importDefault(require("./routes/tournaments"));
const party_1 = __importDefault(require("./routes/party"));
const games_1 = __importDefault(require("./routes/games"));
const adminFinance_1 = __importDefault(require("./routes/adminFinance"));
const adminRisk_1 = __importDefault(require("./routes/adminRisk"));
const webhook_1 = __importDefault(require("./routes/webhook"));
const withdrawalProcessor_1 = __importDefault(require("./routes/withdrawalProcessor"));
const errorHandler_1 = require("./middleware/errorHandler");
const metrics_1 = require("./monitoring/metrics");
exports.app = (0, express_1.default)();
exports.app.disable("etag");
const trustProxySetting = process.env.TRUST_PROXY
    ? process.env.TRUST_PROXY === "true"
        ? 1
        : process.env.TRUST_PROXY
    : process.env.NODE_ENV === "production"
        ? 1
        : false;
exports.app.set("trust proxy", trustProxySetting);
exports.app.use((0, pino_http_1.default)({ logger: logger_1.logger }));
exports.app.use(metrics_1.metricsMiddleware);
exports.app.use("/api/v1/webhook", express_1.default.raw({ type: "application/json" }), webhook_1.default);
exports.app.use(express_1.default.json());
exports.app.use((0, helmet_1.default)());
const allowedOrigins = (process.env.ALLOWED_ORIGINS ||
    process.env.FRONTEND_BASE_URL ||
    "http://localhost:3001")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
const safeAllowedOrigins = process.env.NODE_ENV === "production" &&
    !process.env.ALLOWED_ORIGINS &&
    !process.env.FRONTEND_BASE_URL
    ? []
    : allowedOrigins;
exports.app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && safeAllowedOrigins.includes(origin)) {
        res.header("Access-Control-Allow-Origin", origin);
        res.header("Vary", "Origin");
        res.header("Access-Control-Allow-Credentials", "true");
        res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, Cache-Control, Pragma");
        res.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    }
    if (req.method === "OPTIONS")
        return res.sendStatus(204);
    next();
});
const authLimiter = (0, express_rate_limit_1.default)({
    windowMs: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
    max: Number(process.env.AUTH_RATE_LIMIT_MAX || 60),
    standardHeaders: true,
    legacyHeaders: false,
});
const limiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: Number(process.env.RATE_LIMIT_MAX || 2000),
    standardHeaders: true,
    legacyHeaders: false,
});
exports.app.use(limiter);
exports.app.use("/api/v1/auth/login", authLimiter);
exports.app.use("/api/v1/auth/register", authLimiter);
exports.app.use("/api/v1/auth/forgot-password", authLimiter);
exports.app.use("/api/v1/auth/reset-password", authLimiter);
exports.app.use("/api/v1/auth/resend-admin-verification", authLimiter);
exports.app.use("/health", health_1.default);
exports.app.use("/api/v1/users", users_1.default);
exports.app.use("/api/v1/auth", auth_1.default);
exports.app.use("/api/v1/cards", cards_1.default);
exports.app.use("/api/v1/admin", admin_1.default);
exports.app.use("/api/deposits", deposits_1.default);
exports.app.use("/api/v1/deposits", deposits_1.default);
exports.app.use("/api/v1/withdrawals", withdrawals_1.default);
exports.app.use("/api/connect", connect_1.default);
exports.app.use("/api/v1/connect", connect_1.default);
exports.app.use("/api/v1/tournaments", tournaments_1.default);
exports.app.use("/api/v1/party", party_1.default);
exports.app.use("/api/v1/games", games_1.default);
exports.app.use("/api/admin/finance", adminFinance_1.default);
exports.app.use("/api/v1/admin/finance", adminFinance_1.default);
exports.app.use("/api/v1/admin/risk", adminRisk_1.default);
exports.app.use("/api/v1/withdrawal-processor", withdrawalProcessor_1.default);
exports.app.get("/metrics", metrics_1.metricsHandler);
exports.app.use(errorHandler_1.errorHandler);
