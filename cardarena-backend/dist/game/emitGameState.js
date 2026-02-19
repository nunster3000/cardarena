"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.emitGameStateForGame = emitGameStateForGame;
const db_1 = require("../db");
const io_1 = require("../socket/io");
const stateView_1 = require("./stateView");
async function emitGameStateForGame(gameId, rawState) {
    const [players, game] = await Promise.all([
        db_1.prisma.gamePlayer.findMany({
            where: { gameId },
            select: { userId: true, seat: true },
        }),
        rawState === undefined
            ? db_1.prisma.game.findUnique({
                where: { id: gameId },
                select: { state: true },
            })
            : Promise.resolve(null),
    ]);
    const state = rawState ?? game?.state;
    if (!state)
        return;
    const seatByUserId = new Map();
    for (const p of players) {
        if (p.userId)
            seatByUserId.set(p.userId, p.seat);
    }
    const io = (0, io_1.getIO)();
    const sockets = await io.in(gameId).fetchSockets();
    for (const socket of sockets) {
        const uid = socket.data?.userId || "";
        const seat = seatByUserId.get(uid);
        if (!seat)
            continue;
        socket.emit("game_state", (0, stateView_1.serializeGameStateForSeat)(state, seat));
    }
}
