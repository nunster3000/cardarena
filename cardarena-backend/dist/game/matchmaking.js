"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.joinQueue = joinQueue;
const db_1 = require("../db");
const engine_1 = require("./engine");
const waitingQueues = {};
// key = entryFee, value = array of userIds
async function joinQueue(userId, entryFee, onMatch) {
    const user = await db_1.prisma.user.findUnique({
        where: { id: userId },
        include: { wallet: true },
    });
    if (!user)
        throw new Error("User not found");
    if (user.isFrozen)
        throw new Error("Account is frozen");
    if (!user.wallet)
        throw new Error("Wallet not found");
    if (user.wallet.isFrozen)
        throw new Error("Wallet is frozen");
    if (!waitingQueues[entryFee])
        waitingQueues[entryFee] = [];
    // prevent duplicates
    if (waitingQueues[entryFee].includes(userId))
        return;
    waitingQueues[entryFee].push(userId);
    if (waitingQueues[entryFee].length >= 4) {
        const players = waitingQueues[entryFee].splice(0, 4);
        const { game } = await createTournamentWithPlayers(players, entryFee);
        await onMatch({ gameId: game.id, playerIds: players });
    }
}
async function createTournamentWithPlayers(players, entryFee) {
    return await db_1.prisma.$transaction(async (tx) => {
        // 1️⃣ Create tournament
        const tournament = await tx.tournament.create({
            data: {
                entryFee,
                maxPlayers: 4,
                status: "FULL",
            },
        });
        // 2️⃣ Create entries
        for (let i = 0; i < players.length; i++) {
            await tx.tournamentEntry.create({
                data: {
                    tournamentId: tournament.id,
                    userId: players[i],
                    team: i % 2 === 0 ? "TEAM_A" : "TEAM_B",
                },
            });
        }
        // 3️⃣ Create game record
        const game = await tx.game.create({
            data: {
                tournamentId: tournament.id,
                status: "WAITING",
                phase: "DEALING",
                dealerSeat: 1,
                currentTurnSeat: 2,
                state: {},
            },
        });
        // 4️⃣ Create GamePlayer seats
        for (let i = 0; i < players.length; i++) {
            await tx.gamePlayer.create({
                data: {
                    gameId: game.id,
                    userId: players[i],
                    team: i % 2 === 0 ? "TEAM_A" : "TEAM_B",
                    seat: i + 1,
                },
            });
        }
        return { tournament, game };
    }).then(async ({ tournament, game }) => {
        // 5️⃣ Start the game AFTER transaction completes
        const initialState = await (0, engine_1.startGame)(game.id);
        return { tournament, game, initialState };
    });
}
