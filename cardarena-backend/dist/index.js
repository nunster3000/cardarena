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
const withdrawalProcessor_1 = require("./config/withdrawalProcessor");
const cron_1 = require("./config/cron");
const server = (0, http_1.createServer)(app_1.app);
exports.io = new socket_io_1.Server(server, {
    cors: { origin: "*" },
});
(0, gameSocket_1.registerGameSockets)(exports.io);
let isProcessingWithdrawals = false;
setInterval(async () => {
    if (isProcessingWithdrawals)
        return;
    isProcessingWithdrawals = true;
    try {
        await (0, withdrawalProcessor_1.processPendingWithdrawals)();
    }
    catch (err) {
        console.error(err);
    }
    finally {
        isProcessingWithdrawals = false;
    }
}, 3 * 60 * 1000);
(0, cron_1.startCronJobs)();
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`CardArena backend running on port ${PORT}`);
});
