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

export interface PupilListFilter {
  classGroupId?: string;
  status?: PupilStatus;
}

export function listPupilsBySchool(db: Db, schoolId: string, filter: PupilListFilter = {}) {
  return db.pupil.findMany({
    where: {
      schoolId,
      ...(filter.classGroupId ? { classGroupId: filter.classGroupId } : {}),
      ...(filter.status ? { status: filter.status } : {}),
    },
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

export interface UpdatePupilData {
  firstName?: string;
  lastName?: string;
  classGroupId?: string | null;
  status?: PupilStatus;
}

// Scoped update: the where clause is filtered by both id AND schoolId via
// updateMany so a cross-tenant id can never match (same pattern as
// updateStaffScoped in staffRepository.ts).
export async function updatePupilScoped(
  db: Db,
  schoolId: string,
  id: string,
  data: UpdatePupilData,
): Promise<number> {
  const result = await db.pupil.updateMany({
    where: { id, schoolId },
    data,
  });
  return result.count;
}
