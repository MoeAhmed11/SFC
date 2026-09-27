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

export function updateSchoolSettingsRaw(db: Db, id: string, settingsJson: string) {
  return db.school.update({ where: { id }, data: { settings: settingsJson } });
}
