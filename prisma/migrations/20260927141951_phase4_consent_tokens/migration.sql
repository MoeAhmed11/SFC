-- CreateTable
CREATE TABLE "secure_access_tokens" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "schoolId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "pupilId" TEXT NOT NULL,
    "guardianId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "permittedAction" TEXT NOT NULL DEFAULT 'consent',
    "expiresAt" DATETIME NOT NULL,
    "revokedAt" DATETIME,
    "lastUsedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "secure_access_tokens_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "secure_access_tokens_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "secure_access_tokens_pupilId_fkey" FOREIGN KEY ("pupilId") REFERENCES "pupils" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "secure_access_tokens_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "guardians" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "consent_responses" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "schoolId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "pupilId" TEXT NOT NULL,
    "guardianId" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'current',
    "formVersion" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "submittedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "consent_responses_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "consent_responses_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "consent_responses_pupilId_fkey" FOREIGN KEY ("pupilId") REFERENCES "pupils" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "consent_responses_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "guardians" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "secure_access_tokens_tokenHash_key" ON "secure_access_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "secure_access_tokens_schoolId_idx" ON "secure_access_tokens"("schoolId");

-- CreateIndex
CREATE INDEX "secure_access_tokens_schoolId_eventId_idx" ON "secure_access_tokens"("schoolId", "eventId");

-- CreateIndex
CREATE INDEX "consent_responses_schoolId_idx" ON "consent_responses"("schoolId");

-- CreateIndex
CREATE INDEX "consent_responses_schoolId_eventId_idx" ON "consent_responses"("schoolId", "eventId");

-- CreateIndex
CREATE INDEX "consent_responses_schoolId_eventId_pupilId_guardianId_state_idx" ON "consent_responses"("schoolId", "eventId", "pupilId", "guardianId", "state");
