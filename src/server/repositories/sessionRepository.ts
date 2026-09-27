import type { Db } from "@/server/db";

// Session record data access. Sessions are looked up by token hash; the raw
// token never touches the database.

export interface CreateSessionInput {
  schoolId: string;
  staffUserId: string;
  tokenHash: string;
  expiresAt: Date;
}

export function createSession(db: Db, input: CreateSessionInput) {
  return db.staffSession.create({ data: input });
}

export function findSessionByTokenHash(db: Db, tokenHash: string) {
  return db.staffSession.findUnique({
    where: { tokenHash },
    include: { staffUser: true },
  });
}

export function revokeSessionByTokenHash(db: Db, tokenHash: string) {
  return db.staffSession.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
