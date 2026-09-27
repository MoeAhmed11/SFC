import type { Db } from "@/server/db";

// Read model for the consent dashboard and register. Rows are derived from
// EventRecipient joined to pupil, guardian, and the recipient's CURRENT consent
// response (if any). Everything is scoped by schoolId + eventId.

export interface RecipientRow {
  recipientId: string;
  pupilId: string;
  guardianId: string;
  pupilFirstName: string;
  pupilLastName: string;
  className: string | null;
  guardianName: string;
  guardianEmail: string;
  // "granted" | "declined" | null (null = outstanding / no response).
  response: string | null;
  respondedAt: Date | null;
}

export async function getRecipientRows(
  db: Db,
  schoolId: string,
  eventId: string,
): Promise<RecipientRow[]> {
  const recipients = await db.eventRecipient.findMany({
    where: { schoolId, eventId },
    include: {
      pupil: { include: { classGroup: true } },
      guardian: true,
    },
    orderBy: [{ pupil: { lastName: "asc" } }, { pupil: { firstName: "asc" } }],
  });

  // Fetch current responses for this event in one query, keyed by pupil+guardian.
  const responses = await db.consentResponse.findMany({
    where: { schoolId, eventId, state: "current" },
    select: { pupilId: true, guardianId: true, response: true, submittedAt: true },
  });
  const responseByKey = new Map(
    responses.map((r) => [`${r.pupilId}:${r.guardianId}`, r] as const),
  );

  return recipients.map((r) => {
    const current = responseByKey.get(`${r.pupilId}:${r.guardianId}`);
    return {
      recipientId: r.id,
      pupilId: r.pupilId,
      guardianId: r.guardianId,
      pupilFirstName: r.pupil.firstName,
      pupilLastName: r.pupil.lastName,
      className: r.pupil.classGroup?.name ?? null,
      guardianName: r.guardian.name,
      guardianEmail: r.guardian.email,
      response: current?.response ?? null,
      respondedAt: current?.submittedAt ?? null,
    };
  });
}
