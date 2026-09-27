import { randomBytes } from "node:crypto";
import type { Db } from "@/server/db";
import { hashToken } from "@/server/auth/tokens";
import { INVITE_TOKEN_TTL_DAYS } from "@/server/domain";
import {
  createInviteToken,
  findInviteTokenByHash,
  markInviteTokenUsed,
} from "@/server/repositories/inviteTokenRepository";

// Staff invite-acceptance tokens. Same shape of guarantee as the parent secure
// links (secureLinkService.ts): high-entropy, hash-stored, single-purpose,
// validated entirely server-side, single-use. The raw token is returned once
// by issueInviteToken and is never persisted or logged in plain form.

const TOKEN_BYTES = 32; // 256 bits

export interface IssuedInviteToken {
  raw: string;
  expiresAt: Date;
}

export async function issueInviteToken(
  db: Db,
  schoolId: string,
  staffUserId: string,
): Promise<IssuedInviteToken> {
  const raw = randomBytes(TOKEN_BYTES).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITE_TOKEN_TTL_DAYS * 24 * 3600 * 1000);
  await createInviteToken(db, { schoolId, staffUserId, tokenHash: hashToken(raw), expiresAt });
  return { raw, expiresAt };
}

export interface InviteTokenBinding {
  tokenId: string;
  schoolId: string;
  staffUserId: string;
}

// Validates a raw invite token without consuming it (safe to call repeatedly,
// e.g. to render the acceptance page before the form is submitted). Returns
// null for ANY failure — unknown, expired, or already-used — so no distinction
// is exposed to the caller (mirrors secureLinkService.validateToken's design).
export async function peekInviteToken(db: Db, rawToken: string): Promise<InviteTokenBinding | null> {
  if (!rawToken) return null;
  const record = await findInviteTokenByHash(db, hashToken(rawToken));
  if (!record) return null;
  if (record.usedAt) return null;
  if (record.expiresAt.getTime() <= Date.now()) return null;
  return { tokenId: record.id, schoolId: record.schoolId, staffUserId: record.staffUserId };
}

// Validates AND consumes a raw invite token in one step (status-guarded, so a
// concurrent double-submit can only succeed once). Returns null on any
// failure, including a race where another request consumed it first.
export async function consumeInviteToken(db: Db, rawToken: string): Promise<InviteTokenBinding | null> {
  const binding = await peekInviteToken(db, rawToken);
  if (!binding) return null;
  const consumed = await markInviteTokenUsed(db, binding.tokenId);
  if (consumed === 0) return null; // already used by a concurrent request
  return binding;
}
