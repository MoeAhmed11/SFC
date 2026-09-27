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
