import type { Db } from "@/server/db";

// Data access for staff password reset tokens (Requirement 7 of the MVP
// admin & consent enhancements spec). Tokens are looked up by hash; the raw
// token never touches the database. Mirrors inviteTokenRepository.ts exactly.

export interface CreatePasswordResetTokenInput {
  schoolId: string;
  staffUserId: string;
  tokenHash: string;
  expiresAt: Date;
}

export function createPasswordResetToken(db: Db, input: CreatePasswordResetTokenInput) {
  return db.passwordResetToken.create({ data: input });
}

export function findPasswordResetTokenByHash(db: Db, tokenHash: string) {
  return db.passwordResetToken.findUnique({ where: { tokenHash } });
}

// Marks a token used ONLY if it is not already used (status guard), so a
// replayed/double submission can't consume it twice or race a concurrent
// request — mirrors markInviteTokenUsed.
export async function markPasswordResetTokenUsed(db: Db, id: string): Promise<number> {
  const result = await db.passwordResetToken.updateMany({
    where: { id, usedAt: null },
    data: { usedAt: new Date() },
  });
  return result.count;
}
