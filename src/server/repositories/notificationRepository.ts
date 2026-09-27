import type { Db } from "@/server/db";
import type { NotificationType } from "@/server/domain";

// Tenant-scoped data access for notifications. The queue/scheduler builds on
// these primitives; idempotency comes from the unique dedupeKey.

export interface EnqueueInput {
  schoolId: string;
  eventId: string;
  pupilId: string;
  guardianId: string;
  type: NotificationType;
  dedupeKey: string;
  scheduledAt: Date;
}

// Inserts a scheduled notification, ignoring duplicates (same dedupeKey). Returns
// true if a new row was created, false if it already existed. This makes
// enqueue safe to call repeatedly (retries, concurrent schedulers).
export async function enqueueIfAbsent(db: Db, input: EnqueueInput): Promise<boolean> {
  try {
    await db.notification.create({
      data: {
        schoolId: input.schoolId,
        eventId: input.eventId,
        pupilId: input.pupilId,
        guardianId: input.guardianId,
        type: input.type,
        dedupeKey: input.dedupeKey,
        scheduledAt: input.scheduledAt,
        status: "scheduled",
      },
    });
    return true;
  } catch (err) {
    // Unique-constraint violation on dedupeKey => already enqueued.
    if (isUniqueViolation(err)) return false;
    throw err;
  }
}

// Due jobs: scheduled (or previously failed but retryable) and past their time.
export function findDueNotifications(db: Db, now: Date, limit = 100) {
  return db.notification.findMany({
    where: {
      status: { in: ["scheduled", "failed"] },
      scheduledAt: { lte: now },
    },
    orderBy: { scheduledAt: "asc" },
    take: limit,
  });
}

export function findByDedupeKey(db: Db, dedupeKey: string) {
  return db.notification.findUnique({ where: { dedupeKey } });
}

export function listForEvent(db: Db, schoolId: string, eventId: string) {
  return db.notification.findMany({ where: { schoolId, eventId } });
}

// Marks a notification sent ONLY if it is not already sent (status guard). The
// updateMany where-clause makes a second attempt a no-op, preventing duplicate
// "sent" transitions when a job is retried after a crash mid-send.
export async function markSentGuarded(
  db: Db,
  id: string,
  providerMessageId: string,
): Promise<number> {
  const result = await db.notification.updateMany({
    where: { id, status: { not: "sent" } },
    data: { status: "sent", sentAt: new Date(), providerMessageId, failureCode: null },
  });
  return result.count;
}

export function markFailed(db: Db, id: string, failureCode: string, attempts: number) {
  return db.notification.update({
    where: { id },
    data: { status: "failed", failureCode, attempts },
  });
}

export function cancelScheduled(db: Db, id: string) {
  return db.notification.updateMany({
    where: { id, status: { in: ["scheduled", "failed"] } },
    data: { status: "cancelled" },
  });
}

// Cancels all still-pending notifications for an event (e.g. on cancellation),
// optionally limited to certain types.
export function cancelPendingForEvent(
  db: Db,
  schoolId: string,
  eventId: string,
  types?: NotificationType[],
) {
  return db.notification.updateMany({
    where: {
      schoolId,
      eventId,
      status: { in: ["scheduled", "failed"] },
      ...(types ? { type: { in: types } } : {}),
    },
    data: { status: "cancelled" },
  });
}

// Failed notifications for a school, most recent first — used for operational
// monitoring visibility (Section 11 Reliability: failed jobs must be visible
// to administrators).
export function listFailedNotifications(db: Db, schoolId: string, limit = 100) {
  return db.notification.findMany({
    where: { schoolId, status: "failed" },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "P2002"
  );
}
