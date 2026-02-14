/*
  Warnings:

  - You are about to drop the column `currentTurn` on the `Game` table. All the data in the column will be lost.
  - You are about to drop the column `teamAScore` on the `GameHand` table. All the data in the column will be lost.
  - You are about to drop the column `teamASet` on the `GameHand` table. All the data in the column will be lost.
  - You are about to drop the column `teamBScore` on the `GameHand` table. All the data in the column will be lost.
  - You are about to drop the column `teamBSet` on the `GameHand` table. All the data in the column will be lost.
  - You are about to drop the column `card` on the `GameMove` table. All the data in the column will be lost.
  - You are about to drop the column `trick` on the `GameMove` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `GameMove` table. All the data in the column will be lost.
  - You are about to drop the column `disconnected` on the `GamePlayer` table. All the data in the column will be lost.
  - You are about to drop the `WebhookEvent` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `updatedAt` to the `Card` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `rarity` on the `Card` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Added the required column `currentTurnSeat` to the `Game` table without a default value. This is not possible if the table is not empty.
  - Added the required column `dealerSeat` to the `Game` table without a default value. This is not possible if the table is not empty.
  - Added the required column `teamABid` to the `GameHand` table without a default value. This is not possible if the table is not empty.
  - Added the required column `teamBBid` to the `GameHand` table without a default value. This is not possible if the table is not empty.
  - Added the required column `payload` to the `GameMove` table without a default value. This is not possible if the table is not empty.
  - Added the required column `playerId` to the `GameMove` table without a default value. This is not possible if the table is not empty.
  - Added the required column `type` to the `GameMove` table without a default value. This is not possible if the table is not empty.
  - Added the required column `seat` to the `GamePlayer` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "MoveType" AS ENUM ('DEAL', 'BID', 'PLAY_CARD', 'END_HAND', 'END_GAME');

-- CreateEnum
CREATE TYPE "CardRarity" AS ENUM ('Common', 'Rare', 'Epic', 'Legendary');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "GamePhase" ADD VALUE 'WAITING';
ALTER TYPE "GamePhase" ADD VALUE 'GAME_COMPLETE';

-- AlterEnum
ALTER TYPE "GameStatus" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "Card" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
DROP COLUMN "rarity",
ADD COLUMN     "rarity" "CardRarity" NOT NULL;

-- AlterTable
ALTER TABLE "Game" DROP COLUMN "currentTurn",
ADD COLUMN     "currentTurnSeat" INTEGER NOT NULL,
ADD COLUMN     "dealerSeat" INTEGER NOT NULL,
ALTER COLUMN "phase" SET DEFAULT 'DEALING';

-- AlterTable
ALTER TABLE "GameHand" DROP COLUMN "teamAScore",
DROP COLUMN "teamASet",
DROP COLUMN "teamBScore",
DROP COLUMN "teamBSet",
ADD COLUMN     "teamABid" INTEGER NOT NULL,
ADD COLUMN     "teamAScoreDelta" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "teamATricks" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "teamBBid" INTEGER NOT NULL,
ADD COLUMN     "teamBScoreDelta" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "teamBTricks" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "GameMove" DROP COLUMN "card",
DROP COLUMN "trick",
DROP COLUMN "userId",
ADD COLUMN     "payload" JSONB NOT NULL,
ADD COLUMN     "playerId" TEXT NOT NULL,
ADD COLUMN     "type" "MoveType" NOT NULL;

-- AlterTable
ALTER TABLE "GamePlayer" DROP COLUMN "disconnected",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "disconnectedAt" TIMESTAMP(3),
ADD COLUMN     "replacedByBot" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "seat" INTEGER NOT NULL;

-- DropTable
DROP TABLE "WebhookEvent";

-- CreateIndex
CREATE INDEX "Card_ownerId_createdAt_idx" ON "Card"("ownerId", "createdAt");

-- AddForeignKey
ALTER TABLE "GamePlayer" ADD CONSTRAINT "GamePlayer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameMove" ADD CONSTRAINT "GameMove_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "GamePlayer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
