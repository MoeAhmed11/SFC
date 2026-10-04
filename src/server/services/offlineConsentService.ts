import type { Db } from "@/server/db";
import { prisma } from "@/server/db";
import { recordAudit } from "@/server/audit/audit";
import type { ConsentResponseValue } from "@/server/domain";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { requireCapability, type StaffContext } from "@/server/tenancy/context";
import { parseSchoolSettings } from "@/server/schoolSettings";
import { consentSubmissionSchema } from "@/server/validation";
import { findEventByIdInSchool } from "@/server/repositories/eventRepository";
import { findPupilByIdInSchool } from "@/server/repositories/pupilRepository";
import { findGuardianByIdInSchool } from "@/server/repositories/guardianRepository";
import { findSchoolById } from "@/server/repositories/schoolRepository";
import {
  createResponse,
  findCurrentResponse,
  supersedeCurrent,
} from "@/server/repositories/consentRepository";

// Staff recording a parent's consent decision given OFFLINE — a signed paper
// form, a phone call, or an in-person conversation — rather than through the
// parent's own secure link (decision 17.5, Requirement 6 of the MVP admin &
// consent enhancements spec). Gated on the school's allowOfflineConsent
// setting (off by default, admin-only to change — see schoolSettingsService).
//
// Deliberately bypasses the deadline and allowConsentEditing checks that
// govern the PARENT-facing self-service flow (consentService.submitConsent):
// a staff member transcribing what a parent actually told them is an
// authoritative record of their decision, not a self-service correction, so
// it isn't subject to the rules that exist to control parent self-service.
// It is still blocked once the event itself is cancelled/completed/started,
// mirroring consentResendService's own event-state guard — there is nothing
// left to record consent for at that point.

const CURRENT_FORM_VERSION = 1;

export interface RecordOfflineConsentInput {
  eventId: string;
  pupilId: string;
  guardianId: string;
  response: string;
  notes?: string;
}

export interface OfflineConsentConfirmation {
  response: ConsentResponseValue;
  pupilName: string;
  eventTitle: string;
  submittedAt: Date;
}

export async function recordOfflineConsent(
  db: Db,
  ctx: StaffContext,
  input: RecordOfflineConsentInput,
): Promise<OfflineConsentConfirmation> {
  requireCapability(ctx, "consent.record_offline");

  const school = await findSchoolById(db, ctx.schoolId);
  if (!school) throw new NotFoundError("School not found.");
  const settings = parseSchoolSettings(school.settings);
  if (!settings.allowOfflineConsent) {
    throw new ConflictError("Recording offline consent is not enabled for this school.");
  }

  const parsed = consentSubmissionSchema.safeParse({ response: input.response, notes: input.notes });
  if (!parsed.success) throw new ValidationError("Please choose whether the parent granted or declined consent.");

  const event = await findEventByIdInSchool(db, ctx.schoolId, input.eventId);
  if (!event) throw new NotFoundError("Event not found.");
  if (event.status === "cancelled" || event.status === "completed") {
    throw new ConflictError("Cannot record consent for a cancelled or completed event.");
  }
  if (event.startsAt.getTime() <= Date.now()) {
    throw new ConflictError("Cannot record consent after the event has already started.");
  }

  const pupil = await findPupilByIdInSchool(db, ctx.schoolId, input.pupilId);
  if (!pupil) throw new NotFoundError("Pupil not found.");
  const guardian = await findGuardianByIdInSchool(db, ctx.schoolId, input.guardianId);
  if (!guardian) throw new NotFoundError("Guardian not found.");

  const existing = await findCurrentResponse(db, ctx.schoolId, input.eventId, input.pupilId, input.guardianId);

  // Supersede any prior response and insert the new one atomically — same
  // pattern as consentService.submitConsent.
  await prisma.$transaction(async (txRaw) => {
    const tx = txRaw as unknown as Db;
    if (existing) {
      await supersedeCurrent(tx, ctx.schoolId, input.eventId, input.pupilId, input.guardianId);
    }
    await createResponse(tx, {
      schoolId: ctx.schoolId,
      eventId: input.eventId,
      pupilId: input.pupilId,
      guardianId: input.guardianId,
      response: parsed.data.response as ConsentResponseValue,
      formVersion: CURRENT_FORM_VERSION,
      notes: parsed.data.notes ?? null,
      source: "staff",
      recordedByStaffUserId: ctx.staffUserId,
    });
  });

  await recordAudit(db, {
    schoolId: ctx.schoolId,
    actorType: "staff",
    actorId: ctx.staffUserId,
    action: "consent.recorded_offline",
    entityType: "ConsentResponse",
    entityId: input.eventId,
    metadata: { response: parsed.data.response, pupilId: input.pupilId, guardianId: input.guardianId },
  });

  return {
    response: parsed.data.response as ConsentResponseValue,
    pupilName: `${pupil.firstName} ${pupil.lastName}`,
    eventTitle: event.title,
    submittedAt: new Date(),
  };
}
