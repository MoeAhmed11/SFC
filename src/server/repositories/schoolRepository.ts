import type { Db } from "@/server/db";
import type { SchoolType } from "@/server/domain";

// School (tenant root) data access.

export interface CreateSchoolInput {
  name: string;
  schoolType: SchoolType;
  timezone: string;
}

export function createSchool(db: Db, input: CreateSchoolInput) {
  return db.school.create({
    data: {
      name: input.name,
      schoolType: input.schoolType,
      timezone: input.timezone,
    },
  });
}

export function findSchoolById(db: Db, id: string) {
  return db.school.findUnique({ where: { id } });
}

export function findSchoolByName(db: Db, name: string) {
  return db.school.findFirst({ where: { name } });
}

// Lists every school. Used only by the platform (super-user) layer — there is
// no tenant-scoped equivalent of "list schools" since a staff member only
// ever operates within their own school.
export function listSchools(db: Db) {
  return db.school.findMany({ orderBy: { createdAt: "asc" } });
}

export function updateSchoolSettingsRaw(db: Db, id: string, settingsJson: string) {
  return db.school.update({ where: { id }, data: { settings: settingsJson } });
}

// Read-only usage counts for a single school (platform dashboard). Counts
// only, per the platform layer's view-only scope — no pupil/guardian/consent
// row content is ever read here, only aggregate totals.
export async function getSchoolUsageCounts(db: Db, schoolId: string) {
  const [staffCount, pupilCount, guardianCount, eventCount, publishedEventCount, consentResponseCount] =
    await Promise.all([
      db.staffUser.count({ where: { schoolId } }),
      db.pupil.count({ where: { schoolId } }),
      db.guardian.count({ where: { schoolId } }),
      db.event.count({ where: { schoolId } }),
      db.event.count({ where: { schoolId, status: "published" } }),
      db.consentResponse.count({ where: { schoolId, state: "current" } }),
    ]);
  return { staffCount, pupilCount, guardianCount, eventCount, publishedEventCount, consentResponseCount };
}
