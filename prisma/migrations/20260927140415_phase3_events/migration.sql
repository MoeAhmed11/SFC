-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "schoolId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "startsAt" DATETIME NOT NULL,
    "endsAt" DATETIME NOT NULL,
    "consentDeadline" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdById" TEXT NOT NULL,
    "publishedAt" DATETIME,
    "cancelledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "events_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "events_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "staff_users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "event_recipients" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "schoolId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "pupilId" TEXT NOT NULL,
    "guardianId" TEXT NOT NULL,
    "invitationStatus" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "event_recipients_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "event_recipients_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "event_recipients_pupilId_fkey" FOREIGN KEY ("pupilId") REFERENCES "pupils" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "event_recipients_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "guardians" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "events_schoolId_idx" ON "events"("schoolId");

-- CreateIndex
CREATE INDEX "events_schoolId_status_idx" ON "events"("schoolId", "status");

-- CreateIndex
CREATE INDEX "event_recipients_schoolId_idx" ON "event_recipients"("schoolId");

-- CreateIndex
CREATE INDEX "event_recipients_schoolId_eventId_idx" ON "event_recipients"("schoolId", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "event_recipients_schoolId_eventId_pupilId_guardianId_key" ON "event_recipients"("schoolId", "eventId", "pupilId", "guardianId");
