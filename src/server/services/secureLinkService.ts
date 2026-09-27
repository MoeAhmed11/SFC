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
}

function tokenExpiry(): Date {
  return new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 3600 * 1000);
}

// Issues a token for a recipient. Used internally at publish time and by the
// staff-facing reissue flow (which requires event.manage).
export async function issueTokenForRecipient(
  db: Db,
  schoolId: string,
  eventId: string,
  pupilId: string,
  guardianId: string,
  action: TokenAction = "consent",
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
  });
  return { raw, expiresAt };
}

// Staff-facing safe reissue (FR-04). Revokes any existing live tokens for the
// recipient and issues a fresh one. Requires event.manage + tenant checks.
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

// Validates a raw token entirely server-side. Returns the binding when valid,
// or null for ANY failure (missing, expired, revoked). Callers surface a single
// generic message so the response never reveals whether a record exists
// (FR-04 information-leak avoidance). Updates lastUsedAt on success.
export async function validateToken(db: Db, rawToken: string): Promise<TokenBinding | null> {
  if (!rawToken) return null;
  const record = await findTokenByHash(db, hashToken(rawToken));
  if (!record) return null;
  if (record.revokedAt) return null;
  if (record.expiresAt.getTime() <= Date.now()) return null;

  await markTokenUsed(db, record.id);
  return {
    tokenId: record.id,
    schoolId: record.schoolId,
    eventId: record.eventId,
    pupilId: record.pupilId,
    guardianId: record.guardianId,
    permittedAction: record.permittedAction,
  };
}
