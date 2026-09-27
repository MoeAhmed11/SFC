import type { Db } from "@/server/db";
import { MAX_NOTIFICATION_ATTEMPTS } from "@/server/domain";
import { requireCapability, type StaffContext } from "@/server/tenancy/context";
import { listFailedNotifications } from "@/server/repositories/notificationRepository";

// Operational monitoring for notification delivery (Section 11 Reliability):
// failed jobs must be visible to administrators, and exhausted retries should
// be distinguishable from ones that may still succeed on a future attempt.

export interface FailedNotificationSummary {
  id: string;
  eventId: string;
  type: string;
  attempts: number;
  failureCode: string | null;
  exhausted: boolean;
  scheduledAt: Date;
}

export async function listFailedNotificationsForSchool(
  db: Db,
  ctx: StaffContext,
): Promise<FailedNotificationSummary[]> {
  requireCapability(ctx, "event.view");
  const rows = await listFailedNotifications(db, ctx.schoolId);
  return rows.map((r) => ({
    id: r.id,
    eventId: r.eventId,
    type: r.type,
    attempts: r.attempts,
    failureCode: r.failureCode,
    exhausted: r.attempts >= MAX_NOTIFICATION_ATTEMPTS,
    scheduledAt: r.scheduledAt,
  }));
}
