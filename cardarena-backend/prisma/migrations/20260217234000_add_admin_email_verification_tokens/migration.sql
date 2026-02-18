-- CreateTable
CREATE TABLE "AdminEmailVerificationToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminEmailVerificationToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminEmailVerificationToken_tokenHash_key" ON "AdminEmailVerificationToken"("tokenHash");

-- CreateIndex
CREATE INDEX "AdminEmailVerificationToken_userId_createdAt_idx" ON "AdminEmailVerificationToken"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AdminEmailVerificationToken_expiresAt_usedAt_idx" ON "AdminEmailVerificationToken"("expiresAt", "usedAt");

-- AddForeignKey
ALTER TABLE "AdminEmailVerificationToken" ADD CONSTRAINT "AdminEmailVerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
