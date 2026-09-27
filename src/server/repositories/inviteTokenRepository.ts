import type { Db } from "@/server/db";

// Data access for staff invite-acceptance tokens. Tokens are looked up by
// hash; the raw token never touches the database.

export interface CreateInviteTokenInput {
  schoolId: string;
  staffUserId: string;
  tokenHash: string;
  expiresAt: Date;
}

export function createInviteToken(db: Db, input: CreateInviteTokenInput) {
  return db.inviteToken.create({ data: input });
}

export function findInviteTokenByHash(db: Db, tokenHash: string) {
  return db.inviteToken.findUnique({ where: { tokenHash } });
}

// Marks a token used ONLY if it is not already used (status guard), mirroring
// markSentGuarded's pattern for notifications — prevents a replayed/double
// submission from activating twice or racing a concurrent request.
export async function markInviteTokenUsed(db: Db, id: string): Promise<number> {
  const result = await db.inviteToken.updateMany({
    where: { id, usedAt: null },
    data: { usedAt: new Date() },
  });
  return result.count;
}

// Invalidates any outstanding (unused) invite tokens for a staff user. Used
// when reissuing an invite so an old link can't also be used.
export function invalidateInviteTokensForStaff(db: Db, staffUserId: string) {
  return db.inviteToken.updateMany({
    where: { staffUserId, usedAt: null },
    data: { usedAt: new Date() },
  });
}
