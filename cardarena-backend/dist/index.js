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
const cron_1 = require("./config/cron");
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
(0, gameSocket_1.registerGameSockets)(exports.io);
(0, cron_1.startCronJobs)();
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`CardArena backend running on port ${PORT}`);
});
