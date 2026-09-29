import type { Db } from "@/server/db";
import type { ConsentResponseValue } from "@/server/domain";

// Tenant-scoped data access for consent responses.

export interface CreateConsentInput {
  schoolId: string;
  eventId: string;
  pupilId: string;
  guardianId: string;
  response: ConsentResponseValue;
  formVersion: number;
  notes?: string | null;
}

// The single current response for a pupil+guardian on an event, if any.
export function findCurrentResponse(
  db: Db,
  schoolId: string,
  eventId: string,
  pupilId: string,
  guardianId: string,
) {
  return db.consentResponse.findFirst({
    where: { schoolId, eventId, pupilId, guardianId, state: "current" },
  });
}

// Marks existing current responses for the recipient as superseded (audit
// history is retained — nothing is deleted).
export function supersedeCurrent(
  db: Db,
  schoolId: string,
  eventId: string,
  pupilId: string,
  guardianId: string,
) {
  return db.consentResponse.updateMany({
    where: { schoolId, eventId, pupilId, guardianId, state: "current" },
    data: { state: "superseded" },
  });
}

export function createResponse(db: Db, input: CreateConsentInput) {
  return db.consentResponse.create({ data: { ...input, state: "current" } });
}

export function listResponsesForRecipient(
  db: Db,
  schoolId: string,
  eventId: string,
  pupilId: string,
  guardianId: string,
) {
  return db.consentResponse.findMany({
    where: { schoolId, eventId, pupilId, guardianId },
    orderBy: { submittedAt: "asc" },
  });
}

// Every consent response for a pupil ACROSS ALL EVENTS, newest first,
// including superseded rows (Requirement 2 of the MVP admin & consent
// enhancements spec — a full audit trail of every change of mind, not just
// the current answer). Includes the event title and guardian name so the
// pupil detail page can render a readable history without extra lookups.
export function listConsentHistoryForPupil(db: Db, schoolId: string, pupilId: string) {
  return db.consentResponse.findMany({
    where: { schoolId, pupilId },
    orderBy: { submittedAt: "desc" },
    include: {
      event: { select: { id: true, title: true } },
      guardian: { select: { id: true, name: true } },
    },
  });
}
