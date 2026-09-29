import type { Db } from "@/server/db";
import { recordAudit } from "@/server/audit/audit";
import { ConflictError, NotFoundError } from "@/server/errors";
import { requireCapability, type StaffContext } from "@/server/tenancy/context";
import { reissueLink } from "@/server/services/secureLinkService";
import { createEmailProvider } from "@/server/notifications/EmailProviderConfig";
import { buildEmail } from "@/server/notifications/templates";
import { makeDateFormatter } from "@/server/notifications/format";
import { findEventByIdInSchool } from "@/server/repositories/eventRepository";
import { findPupilByIdInSchool } from "@/server/repositories/pupilRepository";
import { findGuardianByIdInSchool } from "@/server/repositories/guardianRepository";
import { findSchoolById } from "@/server/repositories/schoolRepository";

// Resend/reissue an individual consent link (Requirement 3 of the MVP admin &
// consent enhancements spec — merges the originally separate Requirement 4,
// since a parent changing their mind is handled by the SAME mechanism: staff
// sends a fresh link, the parent submits through the normal consent form).
//
// Available to both admin and organiser (capability: "consent.resend"). This
// is deliberately a thin orchestrator over two already-existing, narrower
// pieces: reissueLink (token mechanics: revoke old, mint new, deadlineExempt)
// and buildEmail/EmailProvider (actual delivery) — neither of which alone
// currently sends an email to the parent.

function parentLinkBase(): string {
  return process.env.PARENT_LINK_BASE_URL ?? "https://app.example/c";
}

export interface ResendConsentLinkResult {
  sent: boolean;
  // Present only when sent is false — short, non-sensitive reason for logs/audit.
  error?: string;
}

export async function resendConsentLink(
  db: Db,
  ctx: StaffContext,
  input: { eventId: string; pupilId: string; guardianId: string },
): Promise<ResendConsentLinkResult> {
  requireCapability(ctx, "consent.resend");

  const event = await findEventByIdInSchool(db, ctx.schoolId, input.eventId);
  if (!event) throw new NotFoundError("Event not found.");
  // Resend works regardless of the consent deadline (before or after) — the
  // only gate is whether the event itself has already happened or the event
  // was called off (Requirement 3.4).
  if (event.status === "cancelled" || event.status === "completed") {
    throw new ConflictError("Cannot resend a link for a cancelled or completed event.");
  }
  if (event.startsAt.getTime() <= Date.now()) {
    throw new ConflictError("Cannot resend a link after the event has already started.");
  }

  const pupil = await findPupilByIdInSchool(db, ctx.schoolId, input.pupilId);
  if (!pupil) throw new NotFoundError("Pupil not found.");
  const guardian = await findGuardianByIdInSchool(db, ctx.schoolId, input.guardianId);
  if (!guardian) throw new NotFoundError("Guardian not found.");
  const school = await findSchoolById(db, ctx.schoolId);
  if (!school) throw new NotFoundError("School not found.");

  // Revokes any live token for this recipient and mints a fresh one marked
  // deadlineExempt (so the parent can act on it even past the deadline).
  const issued = await reissueLink(db, ctx, input);

  let result: ResendConsentLinkResult;
  try {
    const provider = createEmailProvider();
    const message = buildEmail(guardian.email, "consent_request", {
      schoolName: school.name,
      eventTitle: event.title,
      eventStartsAt: event.startsAt,
      eventLocation: event.location,
      consentDeadline: event.consentDeadline,
      instructions: event.description,
      link: `${parentLinkBase()}/${issued.raw}`,
      formatDate: makeDateFormatter(school.timezone),
    });
    await provider.send(message);
    result = { sent: true };
  } catch (err) {
    // Never throw on a transient provider failure — the link has already
    // been issued by the time this runs, so staff/parent still has the
    // fallback of viewing/copying it manually if needed. Same pattern as
    // sendStaffInviteEmail.
    const message = err instanceof Error ? err.message : "unknown_error";
    console.error("[consentResendService] failed to send resend email:", message);
    result = { sent: false, error: message };
  }

  await recordAudit(db, {
    schoolId: ctx.schoolId,
    actorType: "staff",
    actorId: ctx.staffUserId,
    action: "consent.link_resent",
    entityType: "Event",
    entityId: input.eventId,
    metadata: { pupilId: input.pupilId, guardianId: input.guardianId, emailSent: result.sent },
  });

  return result;
}
