-- CreateEnum
CREATE TYPE "SignupStatus" AS ENUM ('PENDING', 'APPROVED', 'WAITLISTED');

-- AlterTable
ALTER TABLE "User"
ADD COLUMN "signupStatus" "SignupStatus" NOT NULL DEFAULT 'APPROVED',
ADD COLUMN "signupRequestedAt" TIMESTAMP(3),
ADD COLUMN "signupReviewedAt" TIMESTAMP(3),
ADD COLUMN "signupReviewedBy" TEXT;

-- CreateTable
CREATE TABLE "AdminNotification" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "payload" JSONB,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "readAt" TIMESTAMP(3),
    "actedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,

    CONSTRAINT "AdminNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminNotification_status_createdAt_idx" ON "AdminNotification"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AdminNotification_userId_createdAt_idx" ON "AdminNotification"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "AdminNotification" ADD CONSTRAINT "AdminNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
