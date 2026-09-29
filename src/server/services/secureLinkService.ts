import { randomBytes } from "node:crypto";
import type { Db } from "@/server/db";
import { recordAudit } from "@/server/audit/audit";
import { hashToken } from "@/server/auth/tokens";
import { TOKEN_TTL_DAYS, type TokenAction } from "@/server/domain";
import { NotFoundError } from "@/server/errors";
import { requireCapability, type StaffContext } from "@/server/tenancy/context";
import { findEventByIdInSchool } from "@/server/repositories/eventRepository";
import { findPupilByIdInSchool } from "@/server/repositories/pupilRepository";
import { findGuardianByIdInSchool } from "@/server/repositories/guardianRepository";
import {
  createAccessToken,
  findTokenByHash,
  markTokenUsed,
  revokeTokensForRecipient,
} from "@/server/repositories/tokenRepository";

// Secure parent links (FR-04). A token is high-entropy (256 bits), bound to a
// specific school+event+pupil+guardian and action, and only its SHA-256 hash is
// persisted. Validation is entirely server-side.

const TOKEN_BYTES = 32; // 256 bits

export interface IssuedToken {
  raw: string; // returned ONCE; delivered via the parent's secure link
  expiresAt: Date;
}

// The verified binding a valid token resolves to. Never derived from client
// input — only from the stored token record.
export interface TokenBinding {
  tokenId: string;
  schoolId: string;
  eventId: string;
  pupilId: string;
  guardianId: string;
  permittedAction: string;
  // True only for tokens minted via the staff-facing reissue flow
  // (Requirement 3 of the MVP admin & consent enhancements spec) — never for
  // the normal bulk-issue path at publish/send time. submitConsent uses this
  // to let a deliberately-reissued link work even after the event's
  // consentDeadline has passed. This is an explicit, stored flag rather than
  // something inferred from timestamps, because consentDeadline can itself be
  // edited after a token already exists — comparing createdAt against a
  // deadline that may move is unreliable.
  deadlineExempt: boolean;
}

function tokenExpiry(): Date {
  return new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 3600 * 1000);
}

// Issues a token for a recipient. Used internally at publish time and by the
// staff-facing reissue flow (which requires event.manage). deadlineExempt
// defaults to false — only reissueLink below sets it true.
export async function issueTokenForRecipient(
  db: Db,
  schoolId: string,
  eventId: string,
  pupilId: string,
  guardianId: string,
  action: TokenAction = "consent",
  options?: { deadlineExempt?: boolean },
): Promise<IssuedToken> {
  const raw = randomBytes(TOKEN_BYTES).toString("base64url");
  const expiresAt = tokenExpiry();
  await createAccessToken(db, {
    schoolId,
    eventId,
    pupilId,
    guardianId,
    tokenHash: hashToken(raw),
    permittedAction: action,
    expiresAt,
    deadlineExempt: options?.deadlineExempt ?? false,
  });
  return { raw, expiresAt };
}

// Staff-facing safe reissue (FR-04, and Requirement 3 of the MVP admin &
// consent enhancements spec). Revokes any existing live tokens for the
// recipient and issues a fresh one marked deadlineExempt — this is always a
// deliberate staff action, so the resulting link is authorised to work even
// past the event's consentDeadline (the resend-service layer above this still
// blocks resending once the event itself has started). Requires
// event.manage + tenant checks.
export async function reissueLink(
  db: Db,
  ctx: StaffContext,
  input: { eventId: string; pupilId: string; guardianId: string },
): Promise<IssuedToken> {
  requireCapability(ctx, "event.manage");

  const event = await findEventByIdInSchool(db, ctx.schoolId, input.eventId);
  if (!event) throw new NotFoundError("Event not found.");
  const pupil = await findPupilByIdInSchool(db, ctx.schoolId, input.pupilId);
  if (!pupil) throw new NotFoundError("Pupil not found.");
  const guardian = await findGuardianByIdInSchool(db, ctx.schoolId, input.guardianId);
  if (!guardian) throw new NotFoundError("Guardian not found.");

  await revokeTokensForRecipient(db, ctx.schoolId, input.eventId, input.pupilId, input.guardianId);
  const issued = await issueTokenForRecipient(
    db,
    ctx.schoolId,
    input.eventId,
    input.pupilId,
    input.guardianId,
    "consent",
    { deadlineExempt: true },
  );

  await recordAudit(db, {
    schoolId: ctx.schoolId,
    actorType: "staff",
    actorId: ctx.staffUserId,
    action: "link.reissued",
    entityType: "SecureAccessToken",
    entityId: input.eventId,
  });
  return issued;
}

// Result of validating a raw token. "revoked" is distinguished from
// "not_found"/"expired" because a revoked token is different from a
// guessed/malicious one: the parent held a REAL, valid link that the school
// itself invalidated by sending a newer one (Requirement 3 of the MVP admin &
// consent enhancements spec) — telling them so isn't an information leak (it
// requires having possessed the real prior token in the first place), and is
// genuinely helpful ("check your email for a newer link"). "not_found" and
// "expired" remain merged into one generic case deliberately, so a guessed or
// stale token still can't be used to probe which records exist (FR-04).
export type TokenValidationResult =
  | { ok: true; binding: TokenBinding }
  | { ok: false; reason: "not_found" | "expired" | "revoked" };

// Validates a raw token entirely server-side. Updates lastUsedAt on success.
export async function validateToken(db: Db, rawToken: string): Promise<TokenValidationResult> {
  if (!rawToken) return { ok: false, reason: "not_found" };
  const record = await findTokenByHash(db, hashToken(rawToken));
  if (!record) return { ok: false, reason: "not_found" };
  if (record.revokedAt) return { ok: false, reason: "revoked" };
  if (record.expiresAt.getTime() <= Date.now()) return { ok: false, reason: "expired" };

  await markTokenUsed(db, record.id);
  return {
    ok: true,
    binding: {
      tokenId: record.id,
      schoolId: record.schoolId,
      eventId: record.eventId,
      pupilId: record.pupilId,
      guardianId: record.guardianId,
      permittedAction: record.permittedAction,
      deadlineExempt: record.deadlineExempt,
    },
  };
}
