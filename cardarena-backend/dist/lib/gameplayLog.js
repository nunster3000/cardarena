"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordGameplayLog = recordGameplayLog;
async function recordGameplayLog(db, input) {
    await db.gameplayLog.create({
        data: {
            userId: input.userId,
            eventType: input.eventType,
            tournamentId: input.tournamentId ?? null,
            gameId: input.gameId ?? null,
            ip: input.ip ?? null,
            userAgent: input.userAgent ?? null,
            device: input.device ?? null,
            metadata: input.metadata,
        },
    });
}
