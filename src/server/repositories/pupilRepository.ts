import type { Db } from "@/server/db";
import type { PupilStatus } from "@/server/domain";

// Tenant-scoped data access for pupils. Every method requires schoolId.

export interface CreatePupilInput {
  schoolId: string;
  firstName: string;
  lastName: string;
  classGroupId?: string | null;
  externalRef?: string | null;
  status?: PupilStatus;
}

export function findPupilByIdInSchool(db: Db, schoolId: string, id: string) {
  return db.pupil.findFirst({ where: { id, schoolId } });
}

export function findPupilByExternalRef(db: Db, schoolId: string, externalRef: string) {
  return db.pupil.findUnique({ where: { schoolId_externalRef: { schoolId, externalRef } } });
}

export function listPupilsBySchool(db: Db, schoolId: string) {
  return db.pupil.findMany({
    where: { schoolId },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
}

export function createPupil(db: Db, input: CreatePupilInput) {
  return db.pupil.create({
    data: {
      schoolId: input.schoolId,
      firstName: input.firstName,
      lastName: input.lastName,
      classGroupId: input.classGroupId ?? null,
      externalRef: input.externalRef ?? null,
      status: input.status ?? "active",
    },
  });
}
