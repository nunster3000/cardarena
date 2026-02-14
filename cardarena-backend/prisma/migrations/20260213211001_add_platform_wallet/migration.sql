/*
  Warnings:

  - The values [A,B] on the enum `Team` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "Team_new" AS ENUM ('TEAM_A', 'TEAM_B');
ALTER TABLE "TournamentEntry" ALTER COLUMN "team" TYPE "Team_new" USING ("team"::text::"Team_new");
ALTER TYPE "Team" RENAME TO "Team_old";
ALTER TYPE "Team_new" RENAME TO "Team";
DROP TYPE "public"."Team_old";
COMMIT;

-- CreateTable
CREATE TABLE "PlatformWallet" (
    "id" TEXT NOT NULL,
    "balance" DECIMAL(65,30) NOT NULL DEFAULT 0.00,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformWallet_pkey" PRIMARY KEY ("id")
);
