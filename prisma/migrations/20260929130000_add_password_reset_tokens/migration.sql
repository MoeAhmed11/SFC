-- CreateTable
-- Staff password reset tokens (Requirement 7 of the MVP admin & consent
-- enhancements spec). Mirrors invite_tokens' shape exactly: a high-entropy,
-- single-purpose, hash-stored token bound to one staff user, consumable once.
CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "staffUserId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_tokenHash_key" ON "password_reset_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_schoolId_idx" ON "password_reset_tokens"("schoolId");

-- CreateIndex
CREATE INDEX "password_reset_tokens_staffUserId_idx" ON "password_reset_tokens"("staffUserId");

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "staff_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
