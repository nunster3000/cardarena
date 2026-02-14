"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setIO = setIO;
exports.getIO = getIO;
let io = null;
function setIO(server) {
    io = server;
}
function getIO() {
    if (!io)
        throw new Error("Socket.io not initialized");
    return io;
}
