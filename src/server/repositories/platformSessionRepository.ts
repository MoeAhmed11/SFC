import type { Db } from "@/server/db";

// PlatformSession record data access. Mirrors sessionRepository.ts: sessions
// are looked up by token hash, and the raw token never touches the database.

export interface CreatePlatformSessionInput {
  platformUserId: string;
  tokenHash: string;
  expiresAt: Date;
}

export function createPlatformSession(db: Db, input: CreatePlatformSessionInput) {
  return db.platformSession.create({ data: input });
}

export function findPlatformSessionByTokenHash(db: Db, tokenHash: string) {
  return db.platformSession.findUnique({
    where: { tokenHash },
    include: { platformUser: true },
  });
}

export function revokePlatformSessionByTokenHash(db: Db, tokenHash: string) {
  return db.platformSession.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
