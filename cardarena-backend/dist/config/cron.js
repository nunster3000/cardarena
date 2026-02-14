"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startCronJobs = startCronJobs;
const node_cron_1 = __importDefault(require("node-cron"));
const withdrawalProcessor_1 = require("../config/withdrawalProcessor");
let isProcessing = false;
function startCronJobs() {
    // Run every 2 minutes
    node_cron_1.default.schedule("*/2 * * * *", async () => {
        if (isProcessing) {
            console.log("Withdrawal processor already running, skipping...");
            return;
        }
        try {
            isProcessing = true;
            console.log("Running withdrawal processor...");
            await (0, withdrawalProcessor_1.processPendingWithdrawals)();
            console.log("Withdrawal processor finished.");
        }
        catch (err) {
            console.error("Cron withdrawal error:", err);
        }
        finally {
            isProcessing = false;
        }
    });
}
