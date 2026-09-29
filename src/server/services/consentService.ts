import type { Db } from "@/server/db";
import { prisma } from "@/server/db";
import { recordAudit } from "@/server/audit/audit";
import type { ConsentResponseValue } from "@/server/domain";
import { ConflictError, NotFoundError, UnauthenticatedError, ValidationError } from "@/server/errors";
import { parseSchoolSettings } from "@/server/schoolSettings";
import { consentSubmissionSchema } from "@/server/validation";
import { validateToken, type TokenBinding } from "@/server/services/secureLinkService";
import { findEventByIdInSchool } from "@/server/repositories/eventRepository";
import { findPupilByIdInSchool } from "@/server/repositories/pupilRepository";
import { findGuardianByIdInSchool } from "@/server/repositories/guardianRepository";
import { findSchoolById } from "@/server/repositories/schoolRepository";
import {
  createResponse,
  findCurrentResponse,
  supersedeCurrent,
} from "@/server/repositories/consentRepository";

// Parent consent (FR-03). Parents have no account; they act via a secure token.
// The token is validated server-side and is the ONLY source of the school /
// event / pupil / guardian identity — URL parameters are never trusted, so a
// parent cannot view or act on another pupil by tampering with the link.

const CURRENT_FORM_VERSION = 1;

// The safe, minimal view a valid token unlocks: the event and the single pupil
// the link is scoped to. No sibling pupils or unrelated data are exposed.
export interface ConsentView {
  event: {
    title: string;
    description: string | null;
    location: string | null;
    startsAt: Date;
    endsAt: Date;
    consentDeadline: Date;
    status: string;
  };
  pupilName: string;
  guardianName: string;
  // The parent's current response, if they have already answered.
  currentResponse: ConsentResponseValue | null;
  deadlinePassed: boolean;
}

// Resolves a raw token to the consent view. Throws a single generic error for
// any invalid/expired/revoked token (no information leak, FR-04).
export async function getConsentView(db: Db, rawToken: string): Promise<ConsentView> {
  const binding = await requireValidToken(db, rawToken);

  const event = await findEventByIdInSchool(db, binding.schoolId, binding.eventId);
  const pupil = await findPupilByIdInSchool(db, binding.schoolId, binding.pupilId);
  const guardian = await findGuardianByIdInSchool(db, binding.schoolId, binding.guardianId);
  if (!event || !pupil || !guardian) throw invalidLink();

  const current = await findCurrentResponse(
    db,
    binding.schoolId,
    binding.eventId,
    binding.pupilId,
    binding.guardianId,
  );

  return {
    event: {
      title: event.title,
      description: event.description,
      location: event.location,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      consentDeadline: event.consentDeadline,
      status: event.status,
    },
    pupilName: `${pupil.firstName} ${pupil.lastName}`,
    guardianName: guardian.name,
    currentResponse: (current?.response as ConsentResponseValue | undefined) ?? null,
    deadlinePassed: event.consentDeadline.getTime() <= Date.now(),
  };
}

export interface ConsentConfirmation {
  response: ConsentResponseValue;
  pupilName: string;
  eventTitle: string;
  submittedAt: Date;
}

// Captures a granted/declined response. Rules enforced:
//  - token must be valid and permit the "consent" action;
//  - event must be published (not draft/cancelled/completed);
//  - the deadline must not have passed, unless the school enables late consent
//    (default OFF, decision 17.3);
//  - a first response is always allowed; changing an existing response requires
//    the school's editing policy (default OFF, decision 17.4). Prior responses
//    are retained as superseded rows — consent is never inferred from silence.
export async function submitConsent(
  db: Db,
  rawToken: string,
  input: { response: string; notes?: string },
): Promise<ConsentConfirmation> {
  const binding = await requireValidToken(db, rawToken);
  if (binding.permittedAction !== "consent") throw invalidLink();

  const parsed = consentSubmissionSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError("Please choose whether you grant or decline consent.");

  const event = await findEventByIdInSchool(db, binding.schoolId, binding.eventId);
  const pupil = await findPupilByIdInSchool(db, binding.schoolId, binding.pupilId);
  if (!event || !pupil) throw invalidLink();

  if (event.status !== "published") {
    throw new ConflictError("This activity is not currently open for consent.");
  }

  const school = await findSchoolById(db, binding.schoolId);
  const settings = parseSchoolSettings(school?.settings);

  // A token deliberately reissued by staff (Requirement 3: resending a link
  // to a parent who wants to change their mind, or missed the original
  // email, works up until the event itself starts — not just until the
  // consent deadline) is staff-authorised to bypass the deadline gate via the
  // explicit deadlineExempt flag set at reissue time. A normally bulk-issued
  // token is unaffected and still subject to the existing rule.
  const deadlinePassed = event.consentDeadline.getTime() <= Date.now();
  if (deadlinePassed && !binding.deadlineExempt && !settings.allowLateConsent) {
    throw new ConflictError("The consent deadline for this activity has passed.");
  }

  const existing = await findCurrentResponse(
    db,
    binding.schoolId,
    binding.eventId,
    binding.pupilId,
    binding.guardianId,
  );
  if (existing && !settings.allowConsentEditing) {
    throw new ConflictError("A response has already been submitted for this activity.");
  }

  // Supersede any prior response and insert the new one atomically.
  await prisma.$transaction(async (txRaw) => {
    const tx = txRaw as unknown as Db;
    if (existing) {
      await supersedeCurrent(tx, binding.schoolId, binding.eventId, binding.pupilId, binding.guardianId);
    }
    await createResponse(tx, {
      schoolId: binding.schoolId,
      eventId: binding.eventId,
      pupilId: binding.pupilId,
      guardianId: binding.guardianId,
      response: parsed.data.response as ConsentResponseValue,
      formVersion: CURRENT_FORM_VERSION,
      notes: parsed.data.notes ?? null,
    });
  });

  // Audit: no notes/personal content, just the recipient and outcome.
  await recordAudit(db, {
    schoolId: binding.schoolId,
    actorType: "parent",
    actorId: binding.guardianId,
    action: existing ? "consent.updated" : "consent.submitted",
    entityType: "ConsentResponse",
    entityId: binding.eventId,
    metadata: { response: parsed.data.response, pupilId: binding.pupilId },
  });

  return {
    response: parsed.data.response as ConsentResponseValue,
    pupilName: `${pupil.firstName} ${pupil.lastName}`,
    eventTitle: event.title,
    submittedAt: new Date(),
  };
}

// --- helpers ---------------------------------------------------------------

// Validates a token and throws the right error for the caller to surface.
// "revoked" gets a DISTINCT message (Requirement 3) — the parent held a real
// link that the school itself invalidated by sending a newer one, so telling
// them that is helpful, not an information leak. Every other failure
// (not_found/expired) still shares one generic message (FR-04).
async function requireValidToken(db: Db, rawToken: string): Promise<TokenBinding> {
  const result = await validateToken(db, rawToken);
  if (!result.ok) {
    if (result.reason === "revoked") throw supersededLink();
    throw invalidLink();
  }
  return result.binding;
}

// A single, generic error for a missing/expired/unknown token so the response
// cannot be used to probe which records exist (FR-04).
function invalidLink() {
  return new UnauthenticatedError("This link is invalid, expired, or has been revoked.");
}

// Distinct message for a token that was revoked because staff sent a newer
// link for the same recipient (Requirement 3.5). Not a generic-message
// exception to FR-04's leak-avoidance rule in practice: reaching this branch
// requires having possessed the real, previously-valid raw token, which an
// attacker guessing/probing tokens could not have.
function supersededLink() {
  return new UnauthenticatedError(
    "This link is no longer valid because a newer link was sent for this consent request. " +
      "Please check your email for the most recent message, or contact the school.",
  );
}
