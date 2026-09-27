-- CreateTable
CREATE TABLE "class_groups" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "yearGroup" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "class_groups_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "pupils" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "schoolId" TEXT NOT NULL,
    "classGroupId" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "externalRef" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "pupils_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "pupils_classGroupId_fkey" FOREIGN KEY ("classGroupId") REFERENCES "class_groups" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "guardians" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "guardians_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "pupil_guardian_relationships" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "schoolId" TEXT NOT NULL,
    "pupilId" TEXT NOT NULL,
    "guardianId" TEXT NOT NULL,
    "relationship" TEXT,
    "isAuthorised" BOOLEAN NOT NULL DEFAULT true,
    "isPrimaryContact" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "pupil_guardian_relationships_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "pupil_guardian_relationships_pupilId_fkey" FOREIGN KEY ("pupilId") REFERENCES "pupils" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "pupil_guardian_relationships_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "guardians" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

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
