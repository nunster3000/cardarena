-- CreateTable
CREATE TABLE "GameMoveAudit" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "playerId" TEXT,
    "type" "MoveType" NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameMoveAudit_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "GameMoveAudit" ADD CONSTRAINT "GameMoveAudit_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
