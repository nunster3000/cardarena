"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logAdminAction = logAdminAction;
async function logAdminAction(db, input) {
    await db.adminActionAudit.create({
        data: {
            adminUserId: input.adminUserId,
            action: input.action,
            targetType: input.targetType,
            targetId: input.targetId,
            reason: input.reason ?? null,
            details: input.details,
        },
    });
}
