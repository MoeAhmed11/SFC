import type { Db } from "@/server/db";

// Deletes records older than a cutoff date, scoped to one school. Only
// SUPERSEDED consent responses are eligible — the CURRENT response for an
// event/pupil/guardian is the operative consent record and must never be
// deleted by a retention sweep, even if it is old (Section 10: "no response
// is not consent" — losing the only record of an existing response would
// silently turn a real answer into an apparent non-response).
export function deleteExpiredSupersededConsentResponses(db: Db, schoolId: string, cutoff: Date) {
  return db.consentResponse.deleteMany({
    where: { schoolId, state: "superseded", submittedAt: { lt: cutoff } },
  });
}

// Only terminal notifications (sent/cancelled/failed) are eligible — a
// "scheduled" row is always in the future by definition and could never be
// older than any realistic cutoff, but the status filter is kept explicit
// for safety regardless.
export function deleteExpiredNotifications(db: Db, schoolId: string, cutoff: Date) {
  return db.notification.deleteMany({
    where: {
      schoolId,
      status: { in: ["sent", "cancelled", "failed"] },
      createdAt: { lt: cutoff },
    },
  });
}

export function deleteExpiredAuditLogs(db: Db, schoolId: string, cutoff: Date) {
  return db.auditLog.deleteMany({
    where: { schoolId, createdAt: { lt: cutoff } },
  });
}

// Read-only counts for a dry run / preview, using the same predicates as the
// delete functions above so a preview accurately reflects what a real sweep
// would remove.
export async function countExpiredRecords(db: Db, schoolId: string, cutoff: Date) {
  const [supersededConsent, notifications, auditLogs] = await Promise.all([
    db.consentResponse.count({ where: { schoolId, state: "superseded", submittedAt: { lt: cutoff } } }),
    db.notification.count({
      where: { schoolId, status: { in: ["sent", "cancelled", "failed"] }, createdAt: { lt: cutoff } },
    }),
    db.auditLog.count({ where: { schoolId, createdAt: { lt: cutoff } } }),
  ]);
  return { supersededConsent, notifications, auditLogs };
}
