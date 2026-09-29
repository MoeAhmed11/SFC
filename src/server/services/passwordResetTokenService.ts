import { randomBytes } from "node:crypto";
import type { Db } from "@/server/db";
import { hashToken } from "@/server/auth/tokens";
import { PASSWORD_RESET_TOKEN_TTL_MINUTES } from "@/server/domain";
import {
  createPasswordResetToken,
  findPasswordResetTokenByHash,
  markPasswordResetTokenUsed,
} from "@/server/repositories/passwordResetTokenRepository";

// Staff password reset tokens (Requirement 7 of the MVP admin & consent
// enhancements spec). Same shape of guarantee as invite-acceptance tokens
// (inviteTokenService.ts): high-entropy, hash-stored, single-purpose,
// validated entirely server-side, single-use. The raw token is returned once
// by issueToken and is never persisted or logged in plain form. Shared by
// both issuance paths (admin-sent and self-serve "forgot password") — neither
// this service nor the consuming reset flow needs to know which one created
// a given token.

const TOKEN_BYTES = 32; // 256 bits

export interface IssuedPasswordResetToken {
  raw: string;
  expiresAt: Date;
}

export async function issuePasswordResetToken(
  db: Db,
  schoolId: string,
  staffUserId: string,
): Promise<IssuedPasswordResetToken> {
  const raw = randomBytes(TOKEN_BYTES).toString("base64url");
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MINUTES * 60 * 1000);
  await createPasswordResetToken(db, { schoolId, staffUserId, tokenHash: hashToken(raw), expiresAt });
  return { raw, expiresAt };
}

export interface PasswordResetTokenBinding {
  tokenId: string;
  schoolId: string;
  staffUserId: string;
}

// Validates a raw reset token without consuming it. Returns null for ANY
// failure — unknown, expired, or already-used — so no distinction is exposed
// to the caller (mirrors peekInviteToken / secureLinkService.validateToken's
// design intent of not leaking which case occurred).
export async function peekPasswordResetToken(
  db: Db,
  rawToken: string,
): Promise<PasswordResetTokenBinding | null> {
  if (!rawToken) return null;
  const record = await findPasswordResetTokenByHash(db, hashToken(rawToken));
  if (!record) return null;
  if (record.usedAt) return null;
  if (record.expiresAt.getTime() <= Date.now()) return null;
  return { tokenId: record.id, schoolId: record.schoolId, staffUserId: record.staffUserId };
}

// Validates AND consumes a raw reset token in one step (status-guarded, so a
// concurrent double-submit can only succeed once). Returns null on any
// failure, including a race where another request consumed it first.
export async function consumePasswordResetToken(
  db: Db,
  rawToken: string,
): Promise<PasswordResetTokenBinding | null> {
  const binding = await peekPasswordResetToken(db, rawToken);
  if (!binding) return null;
  const consumed = await markPasswordResetTokenUsed(db, binding.tokenId);
  if (consumed === 0) return null; // already used by a concurrent request
  return binding;
}
