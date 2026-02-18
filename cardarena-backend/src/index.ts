import dotenv from "dotenv";
dotenv.config();

import { createServer } from "http";
import { Server } from "socket.io";
import { app } from "./app";
import { registerGameSockets } from "./socket/gameSocket";
import { startCronJobs } from "./config/cron";

const allowedOrigins = (
  process.env.ALLOWED_ORIGINS ||
  process.env.FRONTEND_BASE_URL ||
  "http://localhost:3001"
)
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const server = createServer(app);

export const io = new Server(server, {
  cors: {
    origin: allowedOrigins.length ? allowedOrigins : false,
    credentials: true,
  },
});

registerGameSockets(io);

startCronJobs();

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`CardArena backend running on port ${PORT}`);
});
