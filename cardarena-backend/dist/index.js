"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.io = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const auth_1 = __importDefault(require("./routes/auth"));
const health_1 = __importDefault(require("./routes/health"));
const users_1 = __importDefault(require("./routes/users"));
const cards_1 = __importDefault(require("./routes/cards"));
const admin_1 = __importDefault(require("./routes/admin"));
const webhook_1 = __importDefault(require("./routes/webhook"));
const deposits_1 = __importDefault(require("./routes/deposits"));
const withdrawals_1 = __importDefault(require("./routes/withdrawals"));
const withdrawalProcessor_1 = __importDefault(require("./routes/withdrawalProcessor"));
const connect_1 = __importDefault(require("./routes/connect"));
const tournaments_1 = __importDefault(require("./routes/tournaments"));
const adminFinance_1 = __importDefault(require("./routes/adminFinance"));
const errorHandler_1 = require("./middleware/errorHandler");
const helmet_1 = __importDefault(require("helmet"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const pino_http_1 = __importDefault(require("pino-http"));
const logger_1 = require("./utils/logger");
const withdrawalProcessor_2 = require("./config/withdrawalProcessor");
const cron_1 = require("./config/cron");
const gameSocket_1 = require("./socket/gameSocket");
const io_1 = require("./socket/io");
const recovery_1 = require("./game/recovery");
const app = (0, express_1.default)();
const server = (0, http_1.createServer)(app);
exports.io = new socket_io_1.Server(server, {
    cors: {
        origin: "*",
    },
});
(0, io_1.setIO)(exports.io);
// ✅ Register all socket logic in one place
(0, gameSocket_1.registerGameSockets)(exports.io);
// --------------------
// Middleware
// --------------------
app.use((0, pino_http_1.default)({ logger: logger_1.logger }));
app.use("/api/v1/webhook", express_1.default.raw({ type: "application/json" }), webhook_1.default);
app.use(express_1.default.json());
app.use((0, helmet_1.default)());
const limiter = (0, express_rate_limit_1.default)({
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
app.use("/health", health_1.default);
app.use("/api/v1/users", users_1.default);
app.use("/api/v1/auth", auth_1.default);
app.use("/api/v1/cards", cards_1.default);
app.use("/api/v1/admin", admin_1.default);
app.use("/api/deposits", deposits_1.default);
app.use("/api/v1/withdrawals", withdrawals_1.default);
app.use("/api/admin/withdrawals", withdrawalProcessor_1.default);
app.use("/api/connect", connect_1.default);
app.use("/api/v1/tournaments", tournaments_1.default);
app.use("/api/admin/finance", adminFinance_1.default);
app.use(errorHandler_1.errorHandler);
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
        await (0, withdrawalProcessor_2.processPendingWithdrawals)();
    }
    catch (error) {
        console.error("Withdrawal processor failed:", error);
    }
    finally {
        isProcessingWithdrawals = false;
    }
}, 3 * 60 * 1000); // every 3 minutes
// --------------------
// Start Server
// --------------------
const PORT = process.env.PORT || 3000;
server.listen(PORT, async () => {
    console.log(`CardArena backend running on port ${PORT}`);
    await (0, recovery_1.recoverActiveGames)();
});
// Start additional cron jobs
(0, cron_1.startCronJobs)();
