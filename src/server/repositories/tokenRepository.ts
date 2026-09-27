import type { Db } from "@/server/db";

// Tenant-scoped data access for secure access tokens. Tokens are looked up by
// hash; the raw token never touches the database.

export interface CreateTokenInput {
  schoolId: string;
  eventId: string;
  pupilId: string;
  guardianId: string;
  tokenHash: string;
  permittedAction: string;
  expiresAt: Date;
}

export function createAccessToken(db: Db, input: CreateTokenInput) {
  return db.secureAccessToken.create({ data: input });
}

export function findTokenByHash(db: Db, tokenHash: string) {
  return db.secureAccessToken.findUnique({ where: { tokenHash } });
}

export function markTokenUsed(db: Db, id: string) {
  return db.secureAccessToken.update({ where: { id }, data: { lastUsedAt: new Date() } });
}

// Revokes all live tokens for a recipient (used when reissuing).
export function revokeTokensForRecipient(
  db: Db,
  schoolId: string,
  eventId: string,
  pupilId: string,
  guardianId: string,
) {
  return db.secureAccessToken.updateMany({
    where: { schoolId, eventId, pupilId, guardianId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export function revokeTokensForEvent(db: Db, schoolId: string, eventId: string) {
  return db.secureAccessToken.updateMany({
    where: { schoolId, eventId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
