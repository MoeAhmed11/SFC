import type { Db } from "@/server/db";

// Tenant-scoped data access for class groups. Every method requires schoolId.

export function findClassByNameInSchool(db: Db, schoolId: string, name: string) {
  return db.classGroup.findUnique({ where: { schoolId_name: { schoolId, name } } });
}

export function findClassByIdInSchool(db: Db, schoolId: string, id: string) {
  return db.classGroup.findFirst({ where: { id, schoolId } });
}

export function listClassesBySchool(db: Db, schoolId: string) {
  return db.classGroup.findMany({ where: { schoolId }, orderBy: { name: "asc" } });
}

export function createClassGroup(
  db: Db,
  input: { schoolId: string; name: string; yearGroup?: string | null },
) {
  return db.classGroup.create({
    data: { schoolId: input.schoolId, name: input.name, yearGroup: input.yearGroup ?? null },
  });
}
