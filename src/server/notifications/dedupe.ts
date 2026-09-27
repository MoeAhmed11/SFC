import { createHash } from "node:crypto";
import type { NotificationType } from "@/server/domain";

// Deterministic idempotency key for a notification. Two enqueue attempts for the
// same recipient + type + scheduled slot produce the same key, so the unique
// constraint on Notification.dedupeKey prevents a duplicate row — and therefore
// a duplicate send — even across job retries or concurrent schedulers.
//
// The "slot" distinguishes, e.g., the 7-day vs 3-day deadline reminder for the
// same event/recipient. Use a stable label such as "deadline-7d" or the event
// reminder's target date.
export function buildDedupeKey(params: {
  schoolId: string;
  eventId: string;
  pupilId: string;
  guardianId: string;
  type: NotificationType;
  slot: string;
}): string {
  const canonical = [
    params.schoolId,
    params.eventId,
    params.pupilId,
    params.guardianId,
    params.type,
    params.slot,
  ].join("|");
  return createHash("sha256").update(canonical).digest("base64url");
}
