-- AlterEnum
ALTER TYPE "TransactionType" ADD VALUE 'MANUAL_CREDIT';
ALTER TYPE "TransactionType" ADD VALUE 'MANUAL_DEBIT';

-- AlterTable
ALTER TABLE "User"
ADD COLUMN "isFrozen" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "frozenAt" TIMESTAMP(3),
ADD COLUMN "frozenReason" TEXT;

-- AlterTable
ALTER TABLE "Wallet"
ADD COLUMN "isFrozen" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "frozenAt" TIMESTAMP(3),
ADD COLUMN "frozenReason" TEXT;

-- AlterTable
ALTER TABLE "Ledger"
ADD COLUMN "adminUserId" TEXT,
ADD COLUMN "reason" TEXT;

-- CreateTable
CREATE TABLE "WalletAdjustment" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "reason" TEXT NOT NULL,
    "ledgerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "WalletAdjustment_ledgerId_key" ON "WalletAdjustment"("ledgerId");

-- AddForeignKey
ALTER TABLE "WalletAdjustment" ADD CONSTRAINT "WalletAdjustment_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletAdjustment" ADD CONSTRAINT "WalletAdjustment_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed registrations_open default
INSERT INTO "AppSetting" ("key", "value", "createdAt", "updatedAt")
VALUES ('registrations_open', 'true', NOW(), NOW())
ON CONFLICT ("key") DO NOTHING;
