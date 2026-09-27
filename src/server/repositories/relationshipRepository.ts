import type { Db } from "@/server/db";

// Tenant-scoped data access for pupil↔guardian relationships.

export interface UpsertRelationshipInput {
  schoolId: string;
  pupilId: string;
  guardianId: string;
  relationship?: string | null;
  isAuthorised: boolean;
  isPrimaryContact: boolean;
}

export function findRelationship(db: Db, schoolId: string, pupilId: string, guardianId: string) {
  return db.pupilGuardianRelationship.findUnique({
    where: { schoolId_pupilId_guardianId: { schoolId, pupilId, guardianId } },
  });
}

export function listRelationshipsForPupil(db: Db, schoolId: string, pupilId: string) {
  return db.pupilGuardianRelationship.findMany({ where: { schoolId, pupilId } });
}

// Clears the primary-contact flag on all of a pupil's relationships. Used to
// enforce "at most one primary contact per pupil" before setting a new one.
export function clearPrimaryForPupil(db: Db, schoolId: string, pupilId: string) {
  return db.pupilGuardianRelationship.updateMany({
    where: { schoolId, pupilId, isPrimaryContact: true },
    data: { isPrimaryContact: false },
  });
}

export function upsertRelationship(db: Db, input: UpsertRelationshipInput) {
  return db.pupilGuardianRelationship.upsert({
    where: {
      schoolId_pupilId_guardianId: {
        schoolId: input.schoolId,
        pupilId: input.pupilId,
        guardianId: input.guardianId,
      },
    },
    create: {
      schoolId: input.schoolId,
      pupilId: input.pupilId,
      guardianId: input.guardianId,
      relationship: input.relationship ?? null,
      isAuthorised: input.isAuthorised,
      isPrimaryContact: input.isPrimaryContact,
    },
    update: {
      relationship: input.relationship ?? null,
      isAuthorised: input.isAuthorised,
      isPrimaryContact: input.isPrimaryContact,
    },
  });
}
