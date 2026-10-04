import type { Db } from "@/server/db";

// Tenant-scoped data access for guardians. Every method requires schoolId.

export function findGuardianByEmailInSchool(db: Db, schoolId: string, email: string) {
  return db.guardian.findUnique({ where: { schoolId_email: { schoolId, email } } });
}

export function findGuardianByIdInSchool(db: Db, schoolId: string, id: string) {
  return db.guardian.findFirst({ where: { id, schoolId } });
}

export function listGuardiansBySchool(db: Db, schoolId: string) {
  return db.guardian.findMany({ where: { schoolId }, orderBy: { name: "asc" } });
}

export function createGuardian(db: Db, input: { schoolId: string; name: string; email: string }) {
  return db.guardian.create({
    data: { schoolId: input.schoolId, name: input.name, email: input.email },
  });
}

// Scoped update: the where clause is filtered by both id AND schoolId via
// updateMany so a cross-tenant id can never match (same pattern as
// updatePupilScoped in pupilRepository.ts).
export async function updateGuardianScoped(
  db: Db,
  schoolId: string,
  id: string,
  data: { name?: string; email?: string },
): Promise<number> {
  const result = await db.guardian.updateMany({
    where: { id, schoolId },
    data,
  });
  return result.count;
}
