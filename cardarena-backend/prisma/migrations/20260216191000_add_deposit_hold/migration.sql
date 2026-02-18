-- CreateTable
CREATE TABLE "DepositHold" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "depositId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "remainingAmount" INTEGER NOT NULL,
    "releaseAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepositHold_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DepositHold_depositId_key" ON "DepositHold"("depositId");

-- CreateIndex
CREATE INDEX "DepositHold_userId_releaseAt_idx" ON "DepositHold"("userId", "releaseAt");

-- AddForeignKey
ALTER TABLE "DepositHold" ADD CONSTRAINT "DepositHold_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepositHold" ADD CONSTRAINT "DepositHold_depositId_fkey" FOREIGN KEY ("depositId") REFERENCES "Deposit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
