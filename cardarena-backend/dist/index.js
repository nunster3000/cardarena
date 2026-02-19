"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.io = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const app_1 = require("./app");
const gameSocket_1 = require("./socket/gameSocket");
const io_1 = require("./socket/io");
const cron_1 = require("./config/cron");
const runtime_1 = require("./config/runtime");
const logger_1 = require("./utils/logger");
const allowedOrigins = (process.env.ALLOWED_ORIGINS ||
    process.env.FRONTEND_BASE_URL ||
    "http://localhost:3001")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
const server = (0, http_1.createServer)(app_1.app);
exports.io = new socket_io_1.Server(server, {
    cors: {
        origin: allowedOrigins.length ? allowedOrigins : false,
        credentials: true,
    },
});
const PORT = process.env.PORT || 3000;
async function configureSocketAdapter() {
    if (!process.env.REDIS_URL)
        return;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createAdapter } = require("@socket.io/redis-adapter");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createClient } = require("redis");
    const pubClient = createClient({ url: process.env.REDIS_URL });
    const subClient = pubClient.duplicate();
    try {
        await Promise.all([pubClient.connect(), subClient.connect()]);
        exports.io.adapter(createAdapter(pubClient, subClient));
        logger_1.logger.info("Socket.IO Redis adapter enabled");
    }
    catch (err) {
        logger_1.logger.error({ err }, "Failed to initialize Socket.IO Redis adapter");
        await Promise.allSettled([pubClient.quit(), subClient.quit()]);
        if (process.env.REQUIRE_DURABLE_QUEUE === "true")
            throw err;
    }
}
async function bootstrap() {
    await configureSocketAdapter();
    (0, io_1.setIO)(exports.io);
    (0, gameSocket_1.registerGameSockets)(exports.io);
    (0, cron_1.startCronJobs)();
    const runtime = (0, runtime_1.validateRuntimeConfig)();
    if (process.env.REQUIRE_DURABLE_QUEUE === "true" && runtime.queueMode !== "REDIS") {
        throw new Error("REQUIRE_DURABLE_QUEUE is true but REDIS_URL is not configured.");
    }
    logger_1.logger.info({ queueMode: runtime.queueMode, env: runtime.env, warningCount: runtime.warnings.length }, "Runtime initialized");
    server.listen(PORT, () => {
        console.log(`CardArena backend running on port ${PORT}`);
    });
}
bootstrap().catch((err) => {
    logger_1.logger.error({ err }, "Fatal startup error");
    process.exit(1);
});
