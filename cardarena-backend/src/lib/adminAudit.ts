import { Prisma, PrismaClient } from "@prisma/client";

type DbClient = PrismaClient | Prisma.TransactionClient;

type AuditInput = {
  adminUserId: string;
  action: string;
  targetType: string;
  targetId: string;
  reason?: string | null;
  details?: Prisma.InputJsonValue;
};

export async function logAdminAction(db: DbClient, input: AuditInput) {
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
