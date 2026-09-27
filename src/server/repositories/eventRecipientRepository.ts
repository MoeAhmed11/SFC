import type { Db } from "@/server/db";

// Tenant-scoped data access for event recipients.

export function listRecipientsForEvent(db: Db, schoolId: string, eventId: string) {
  return db.eventRecipient.findMany({ where: { schoolId, eventId } });
}

export function countRecipientsForEvent(db: Db, schoolId: string, eventId: string) {
  return db.eventRecipient.count({ where: { schoolId, eventId } });
}

// Creates recipient rows, skipping duplicates so publish is safe to re-run.
export function createRecipients(
  db: Db,
  rows: { schoolId: string; eventId: string; pupilId: string; guardianId: string }[],
) {
  return db.eventRecipient.createMany({ data: rows });
}

// Finds pupils in a class (or the whole school when classGroupId is null) that
// have an authorised primary-contact guardian, returning pupil+guardian pairs.
// Only active pupils/guardians are eligible.
export async function findPrimaryContactPairs(
  db: Db,
  schoolId: string,
  classGroupId: string | null,
): Promise<{ pupilId: string; guardianId: string }[]> {
  const rels = await db.pupilGuardianRelationship.findMany({
    where: {
      schoolId,
      isPrimaryContact: true,
      isAuthorised: true,
      pupil: {
        status: "active",
        ...(classGroupId ? { classGroupId } : {}),
      },
      guardian: { status: "active" },
    },
    select: { pupilId: true, guardianId: true },
  });
  return rels;
}
