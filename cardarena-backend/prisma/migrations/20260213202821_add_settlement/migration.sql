-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN     "settled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "settledAt" TIMESTAMP(3);
