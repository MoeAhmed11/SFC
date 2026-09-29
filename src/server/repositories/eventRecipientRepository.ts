import type { Db } from "@/server/db";

// Tenant-scoped data access for event recipients.

export function listRecipientsForEvent(db: Db, schoolId: string, eventId: string) {
  return db.eventRecipient.findMany({ where: { schoolId, eventId } });
}

export function countRecipientsForEvent(db: Db, schoolId: string, eventId: string) {
  return db.eventRecipient.count({ where: { schoolId, eventId } });
}

// Every event-recipient pairing for a pupil, across all events, with the
// event and guardian joined in. Used by the pupil detail page (Requirement 3
// of the MVP admin & consent enhancements spec) to offer a "resend link"
// action per event+guardian the pupil is registered for. Ordered by event
// start so upcoming activities surface first.
export function listRecipientPairingsForPupil(db: Db, schoolId: string, pupilId: string) {
  return db.eventRecipient.findMany({
    where: { schoolId, pupilId },
    orderBy: { event: { startsAt: "asc" } },
    include: {
      event: { select: { id: true, title: true, startsAt: true, status: true } },
      guardian: { select: { id: true, name: true, email: true } },
    },
  });
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
