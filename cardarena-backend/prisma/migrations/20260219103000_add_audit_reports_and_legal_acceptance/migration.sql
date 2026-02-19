-- Add legal acceptance timestamps to users
ALTER TABLE "User"
  ADD COLUMN "termsAcceptedAt" TIMESTAMP(3),
  ADD COLUMN "privacyAcceptedAt" TIMESTAMP(3);

-- Add device info to user signal logs
ALTER TABLE "UserSignal"
  ADD COLUMN "device" TEXT;

-- Gameplay audit trail for chargeback protection and compliance reporting
CREATE TABLE "GameplayLog" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tournamentId" TEXT,
  "gameId" TEXT,
  "eventType" TEXT NOT NULL,
  "ip" TEXT,
  "userAgent" TEXT,
  "device" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GameplayLog_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "GameplayLog"
  ADD CONSTRAINT "GameplayLog_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "GameplayLog_userId_createdAt_idx" ON "GameplayLog"("userId", "createdAt");
CREATE INDEX "GameplayLog_tournamentId_createdAt_idx" ON "GameplayLog"("tournamentId", "createdAt");
CREATE INDEX "GameplayLog_gameId_createdAt_idx" ON "GameplayLog"("gameId", "createdAt");
CREATE INDEX "GameplayLog_eventType_createdAt_idx" ON "GameplayLog"("eventType", "createdAt");
