import dotenv from "dotenv";
dotenv.config();

import { createServer } from "http";
import { Server } from "socket.io";
import { app } from "./app";
import { registerGameSockets } from "./socket/gameSocket";
import { processPendingWithdrawals } from "./config/withdrawalProcessor";
import { startCronJobs } from "./config/cron";

const server = createServer(app);

export const io = new Server(server, {
  cors: { origin: "*" },
});

registerGameSockets(io);

let isProcessingWithdrawals = false;

setInterval(async () => {
  if (isProcessingWithdrawals) return;

  isProcessingWithdrawals = true;

  try {
    await processPendingWithdrawals();
  } catch (err) {
    console.error(err);
  } finally {
    isProcessingWithdrawals = false;
  }
}, 3 * 60 * 1000);

startCronJobs();

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`CardArena backend running on port ${PORT}`);
});


