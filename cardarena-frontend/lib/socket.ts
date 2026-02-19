import { io, Socket } from "socket.io-client";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3000";

let socket: Socket | null = null;

export function getGameSocket(token: string) {
  if (socket && socket.connected) return socket;
  if (socket) {
    socket.disconnect();
    socket = null;
  }

  socket = io(API_BASE, {
    transports: ["websocket", "polling"],
    auth: { token },
    withCredentials: true,
  });

  return socket;
}

export function closeGameSocket() {
  if (!socket) return;
  socket.disconnect();
  socket = null;
}

