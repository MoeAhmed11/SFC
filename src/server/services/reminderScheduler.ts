import type { Db } from "@/server/db";
import {
  DEFAULT_DEADLINE_REMINDER_OFFSET_DAYS,
  DEFAULT_EVENT_REMINDER_OFFSET_DAYS,
  type NotificationType,
} from "@/server/domain";
import { buildDedupeKey } from "@/server/notifications/dedupe";
import { enqueueIfAbsent, cancelPendingForEvent } from "@/server/repositories/notificationRepository";

// Schedules the notifications for an event at publish time (FR-06, FR-07). Each
// enqueue is idempotent (unique dedupeKey), so re-publishing or a retried
// scheduler never creates duplicates.
//
// Slots scheduled per recipient:
//  - consent_request  : immediately (scheduledAt = now)
//  - deadline_reminder : at deadline minus each configured offset (default 7/3/1d)
//  - event_reminder    : at event start minus the event-reminder offset (default 1d)
//
// Reminders whose computed time is already in the past are skipped (nothing to
// schedule). Send-time eligibility (still outstanding / consented) is enforced
// later by the worker, not here.

const DAY_MS = 24 * 3600 * 1000;

export interface ScheduleInput {
  schoolId: string;
  eventId: string;
  consentDeadline: Date;
  eventStartsAt: Date;
  recipients: { pupilId: string; guardianId: string }[];
  now?: Date;
}

export async function scheduleEventNotifications(db: Db, input: ScheduleInput): Promise<number> {
  const now = input.now ?? new Date();
  let scheduled = 0;

  for (const r of input.recipients) {
    // Consent request — send now.
    scheduled += await enqueue(db, input, r, "consent_request", "initial", now);

    // Deadline reminders — deadline minus each offset, if still in the future.
    for (const offset of DEFAULT_DEADLINE_REMINDER_OFFSET_DAYS) {
      const at = new Date(input.consentDeadline.getTime() - offset * DAY_MS);
      if (at.getTime() > now.getTime()) {
        scheduled += await enqueue(db, input, r, "deadline_reminder", `deadline-${offset}d`, at);
      }
    }

    // Event reminder — event start minus the event-reminder offset.
    const eventReminderAt = new Date(
      input.eventStartsAt.getTime() - DEFAULT_EVENT_REMINDER_OFFSET_DAYS * DAY_MS,
    );
    if (eventReminderAt.getTime() > now.getTime()) {
      scheduled += await enqueue(
        db,
        input,
        r,
        "event_reminder",
        `event-${DEFAULT_EVENT_REMINDER_OFFSET_DAYS}d`,
        eventReminderAt,
      );
    }
  }

  return scheduled;
}

async function enqueue(
  db: Db,
  input: ScheduleInput,
  recipient: { pupilId: string; guardianId: string },
  type: NotificationType,
  slot: string,
  scheduledAt: Date,
): Promise<number> {
  const dedupeKey = buildDedupeKey({
    schoolId: input.schoolId,
    eventId: input.eventId,
    pupilId: recipient.pupilId,
    guardianId: recipient.guardianId,
    type,
    slot,
  });
  const created = await enqueueIfAbsent(db, {
    schoolId: input.schoolId,
    eventId: input.eventId,
    pupilId: recipient.pupilId,
    guardianId: recipient.guardianId,
    type,
    dedupeKey,
    scheduledAt,
  });
  return created ? 1 : 0;
}

// On cancellation, suppress all still-pending notifications for the event
// (Journey F / FR-07). Sent ones are left as history.
export function suppressPendingForEvent(db: Db, schoolId: string, eventId: string) {
  return cancelPendingForEvent(db, schoolId, eventId);
}
