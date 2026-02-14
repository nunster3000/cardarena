import cron from "node-cron";
import { processPendingWithdrawals } from "../config/withdrawalProcessor";

let isProcessing = false;

export function startCronJobs() {
  // Run every 2 minutes
  cron.schedule("*/2 * * * *", async () => {
    if (isProcessing) {
      console.log("Withdrawal processor already running, skipping...");
      return;
    }

    try {
      isProcessing = true;
      console.log("Running withdrawal processor...");
      await processPendingWithdrawals();
      console.log("Withdrawal processor finished.");
    } catch (err) {
      console.error("Cron withdrawal error:", err);
    } finally {
      isProcessing = false;
    }
  });
}
