/*
  Warnings:

  - Added the required column `team` to the `TournamentEntry` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "Team" AS ENUM ('A', 'B');

-- AlterTable
ALTER TABLE "TournamentEntry" ADD COLUMN     "isWinner" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "team" "Team" NOT NULL;
