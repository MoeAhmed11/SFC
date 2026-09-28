-- CreateTable
CREATE TABLE "schools" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "schoolType" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/London',
    "settings" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_users" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'invited',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_sessions" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "staffUserId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "staff_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_groups" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "yearGroup" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "class_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pupils" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "classGroupId" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "externalRef" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pupils_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardians" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guardians_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pupil_guardian_relationships" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "pupilId" TEXT NOT NULL,
    "guardianId" TEXT NOT NULL,
    "relationship" TEXT,
    "isAuthorised" BOOLEAN NOT NULL DEFAULT true,
    "isPrimaryContact" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pupil_guardian_relationships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "consentDeadline" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdById" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_recipients" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "pupilId" TEXT NOT NULL,
    "guardianId" TEXT NOT NULL,
    "invitationStatus" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "secure_access_tokens" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "pupilId" TEXT NOT NULL,
    "guardianId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "permittedAction" TEXT NOT NULL DEFAULT 'consent',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "secure_access_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_responses" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "pupilId" TEXT NOT NULL,
    "guardianId" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'current',
    "formVersion" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consent_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "pupilId" TEXT NOT NULL,
    "guardianId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3),
    "providerMessageId" TEXT,
    "failureCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invite_tokens" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "staffUserId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invite_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "staff_users_schoolId_idx" ON "staff_users"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "staff_users_schoolId_email_key" ON "staff_users"("schoolId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "staff_sessions_tokenHash_key" ON "staff_sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "staff_sessions_staffUserId_idx" ON "staff_sessions"("staffUserId");

-- CreateIndex
CREATE INDEX "staff_sessions_schoolId_idx" ON "staff_sessions"("schoolId");

-- CreateIndex
CREATE INDEX "audit_logs_schoolId_idx" ON "audit_logs"("schoolId");

-- CreateIndex
CREATE INDEX "audit_logs_schoolId_createdAt_idx" ON "audit_logs"("schoolId", "createdAt");

-- CreateIndex
CREATE INDEX "class_groups_schoolId_idx" ON "class_groups"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "class_groups_schoolId_name_key" ON "class_groups"("schoolId", "name");

-- CreateIndex
CREATE INDEX "pupils_schoolId_idx" ON "pupils"("schoolId");

-- CreateIndex
CREATE INDEX "pupils_schoolId_classGroupId_idx" ON "pupils"("schoolId", "classGroupId");

-- CreateIndex
CREATE UNIQUE INDEX "pupils_schoolId_externalRef_key" ON "pupils"("schoolId", "externalRef");

-- CreateIndex
CREATE INDEX "guardians_schoolId_idx" ON "guardians"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "guardians_schoolId_email_key" ON "guardians"("schoolId", "email");

-- CreateIndex
CREATE INDEX "pupil_guardian_relationships_schoolId_idx" ON "pupil_guardian_relationships"("schoolId");

-- CreateIndex
CREATE INDEX "pupil_guardian_relationships_schoolId_pupilId_idx" ON "pupil_guardian_relationships"("schoolId", "pupilId");

-- CreateIndex
CREATE INDEX "pupil_guardian_relationships_schoolId_guardianId_idx" ON "pupil_guardian_relationships"("schoolId", "guardianId");

-- CreateIndex
CREATE UNIQUE INDEX "pupil_guardian_relationships_schoolId_pupilId_guardianId_key" ON "pupil_guardian_relationships"("schoolId", "pupilId", "guardianId");

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

-- CreateIndex
CREATE UNIQUE INDEX "notifications_dedupeKey_key" ON "notifications"("dedupeKey");

-- CreateIndex
CREATE INDEX "notifications_schoolId_idx" ON "notifications"("schoolId");

-- CreateIndex
CREATE INDEX "notifications_status_scheduledAt_idx" ON "notifications"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "notifications_schoolId_eventId_idx" ON "notifications"("schoolId", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "invite_tokens_tokenHash_key" ON "invite_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "invite_tokens_schoolId_idx" ON "invite_tokens"("schoolId");

-- CreateIndex
CREATE INDEX "invite_tokens_staffUserId_idx" ON "invite_tokens"("staffUserId");

-- AddForeignKey
ALTER TABLE "staff_users" ADD CONSTRAINT "staff_users_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_sessions" ADD CONSTRAINT "staff_sessions_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "staff_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_groups" ADD CONSTRAINT "class_groups_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pupils" ADD CONSTRAINT "pupils_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pupils" ADD CONSTRAINT "pupils_classGroupId_fkey" FOREIGN KEY ("classGroupId") REFERENCES "class_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pupil_guardian_relationships" ADD CONSTRAINT "pupil_guardian_relationships_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pupil_guardian_relationships" ADD CONSTRAINT "pupil_guardian_relationships_pupilId_fkey" FOREIGN KEY ("pupilId") REFERENCES "pupils"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pupil_guardian_relationships" ADD CONSTRAINT "pupil_guardian_relationships_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "guardians"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_recipients" ADD CONSTRAINT "event_recipients_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_recipients" ADD CONSTRAINT "event_recipients_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_recipients" ADD CONSTRAINT "event_recipients_pupilId_fkey" FOREIGN KEY ("pupilId") REFERENCES "pupils"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_recipients" ADD CONSTRAINT "event_recipients_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "guardians"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "secure_access_tokens" ADD CONSTRAINT "secure_access_tokens_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "secure_access_tokens" ADD CONSTRAINT "secure_access_tokens_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "secure_access_tokens" ADD CONSTRAINT "secure_access_tokens_pupilId_fkey" FOREIGN KEY ("pupilId") REFERENCES "pupils"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "secure_access_tokens" ADD CONSTRAINT "secure_access_tokens_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "guardians"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_responses" ADD CONSTRAINT "consent_responses_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_responses" ADD CONSTRAINT "consent_responses_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_responses" ADD CONSTRAINT "consent_responses_pupilId_fkey" FOREIGN KEY ("pupilId") REFERENCES "pupils"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_responses" ADD CONSTRAINT "consent_responses_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "guardians"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invite_tokens" ADD CONSTRAINT "invite_tokens_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invite_tokens" ADD CONSTRAINT "invite_tokens_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "staff_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
