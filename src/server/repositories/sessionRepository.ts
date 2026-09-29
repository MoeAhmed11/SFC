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

// Revokes every live session for a staff user in one go (Requirement 7 of the
// MVP admin & consent enhancements spec): once a password reset actually
// completes, all existing sessions must be invalidated — unlike
// deactivateStaff, whose effect on sessions is implicit (resolveSession
// checks staffUser.status), a password reset happens while the account stays
// "active" throughout, so the session rows must be revoked directly here.
export function revokeAllSessionsForStaff(db: Db, staffUserId: string) {
  return db.staffSession.updateMany({
    where: { staffUserId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
