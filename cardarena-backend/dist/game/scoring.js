"use strict";
// src/game/scoring.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveHand = resolveHand;
exports.scoreHand = scoreHand;
const db_1 = require("../db");
const client_1 = require("@prisma/client");
const tournamentSettlement_1 = require("./tournamentSettlement");
const emitGameState_1 = require("./emitGameState");
async function resolveHand(gameId) {
    const game = await db_1.prisma.game.findUnique({
        where: { id: gameId },
    });
    if (!game)
        throw new Error("Game not found");
    const state = game.state;
    if (!state)
        throw new Error("Game state missing");
    const teamABid = Number(state.bids?.[1] || 0) + Number(state.bids?.[3] || 0);
    const teamBBid = Number(state.bids?.[2] || 0) + Number(state.bids?.[4] || 0);
    const teamATricks = Number(state.teamATricks || 0);
    const teamBTricks = Number(state.teamBTricks || 0);
    // --------------------------
    // SCORE CALCULATION
    // --------------------------
    let teamAScoreDelta = 0;
    let teamBScoreDelta = 0;
    // TEAM A
    if (teamATricks < teamABid) {
        teamAScoreDelta = -teamABid * 10;
        state.teamASets = (state.teamASets || 0) + 1;
    }
    else {
        teamAScoreDelta = teamABid * 10;
    }
    // TEAM B
    if (teamBTricks < teamBBid) {
        teamBScoreDelta = -teamBBid * 10;
        state.teamBSets = (state.teamBSets || 0) + 1;
    }
    else {
        teamBScoreDelta = teamBBid * 10;
    }
    state.teamAScore = (state.teamAScore || 0) + teamAScoreDelta;
    state.teamBScore = (state.teamBScore || 0) + teamBScoreDelta;
    // Check win condition
    const teamAScore = state.teamAScore;
    const teamBScore = state.teamBScore;
    const teamASets = state.teamASets;
    const teamBSets = state.teamBSets;
    const teamAWin = teamAScore >= 300 || teamBSets >= 2;
    const teamBWin = teamBScore >= 300 || teamASets >= 2;
    if (teamAWin || teamBWin) {
        state.phase = client_1.GamePhase.GAME_COMPLETE;
        await db_1.prisma.game.update({
            where: { id: gameId },
            data: {
                status: client_1.GameStatus.COMPLETED,
                winnerTeam: teamAWin ? "TEAM_A" : "TEAM_B",
                state: state,
            },
        });
        const updatedState = state;
        await (0, emitGameState_1.emitGameStateForGame)(gameId, updatedState);
        // Auto-settle tournament
        await (0, tournamentSettlement_1.settleTournamentFromGame)(gameId);
        return;
    }
    // Rotate dealer clockwise
    const dealerSeat = state.dealerSeat;
    state.dealerSeat = dealerSeat === 4 ? 1 : dealerSeat + 1;
    // Reset hand state
    state.phase = client_1.GamePhase.DEALING;
    state.bids = {};
    state.trick = [];
    state.completedTricks = 0;
    state.teamATricks = 0;
    state.teamBTricks = 0;
    state.handNumber = (state.handNumber || 1) + 1;
    // You will call deal logic again
    await db_1.prisma.game.update({
        where: { id: gameId },
        data: {
            state: state,
        },
    });
    const updatedState = state;
    await (0, emitGameState_1.emitGameStateForGame)(gameId, updatedState);
    return state;
}
async function scoreHand(gameId) {
    return resolveHand(gameId);
}
