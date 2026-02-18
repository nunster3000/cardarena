-- CreateEnum
CREATE TYPE "RiskFlagType" AS ENUM ('RAPID_DEPOSIT_WITHDRAW', 'HIGH_WIN_RATE', 'COLLUSION_SUSPECT', 'MULTI_ACCOUNT_SUSPECT', 'WITHDRAWAL_VELOCITY');

-- CreateEnum
CREATE TYPE "RiskFlagSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "RiskFlagStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateEnum
CREATE TYPE "UserSignalType" AS ENUM ('REGISTER', 'LOGIN', 'DEPOSIT', 'WITHDRAW');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "riskScore" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "withdrawalBlocked" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Withdrawal" ADD COLUMN "adminHold" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "adminHoldAt" TIMESTAMP(3),
ADD COLUMN "adminHeldBy" TEXT,
ADD COLUMN "adminHoldReason" TEXT,
ADD COLUMN "autoFlagged" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "riskScore" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "RiskFlag" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "RiskFlagType" NOT NULL,
    "severity" "RiskFlagSeverity" NOT NULL,
    "status" "RiskFlagStatus" NOT NULL DEFAULT 'OPEN',
    "score" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "RiskFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSignal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "UserSignalType" NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserSignal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RiskFlag_userId_createdAt_idx" ON "RiskFlag"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "RiskFlag_status_severity_createdAt_idx" ON "RiskFlag"("status", "severity", "createdAt");

-- CreateIndex
CREATE INDEX "UserSignal_userId_createdAt_idx" ON "UserSignal"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "UserSignal_ip_userAgent_createdAt_idx" ON "UserSignal"("ip", "userAgent", "createdAt");

-- AddForeignKey
ALTER TABLE "RiskFlag" ADD CONSTRAINT "RiskFlag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSignal" ADD CONSTRAINT "UserSignal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
