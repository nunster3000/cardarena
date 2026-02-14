-- CreateEnum
CREATE TYPE "PlatformTransactionType" AS ENUM ('TOURNAMENT_FEE', 'MANUAL_ADJUSTMENT');

-- CreateTable
CREATE TABLE "PlatformLedger" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "type" "PlatformTransactionType" NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "balanceAfter" DECIMAL(65,30) NOT NULL,
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformLedger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlatformLedger_reference_idx" ON "PlatformLedger"("reference");

-- AddForeignKey
ALTER TABLE "PlatformLedger" ADD CONSTRAINT "PlatformLedger_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "PlatformWallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
