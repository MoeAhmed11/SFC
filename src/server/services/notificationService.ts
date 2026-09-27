import type { Db } from "@/server/db";
import { prisma } from "@/server/db";
import { recordAudit } from "@/server/audit/audit";
import {
  MAX_NOTIFICATION_ATTEMPTS,
  type NotificationType,
} from "@/server/domain";
import { EmailDeliveryError, type EmailProvider } from "@/server/notifications/EmailProvider";
import { buildEmail } from "@/server/notifications/templates";
import { makeDateFormatter } from "@/server/notifications/format";
import { issueTokenForRecipient } from "@/server/services/secureLinkService";
import { findEventByIdInSchool } from "@/server/repositories/eventRepository";
import { findPupilByIdInSchool } from "@/server/repositories/pupilRepository";
import { findGuardianByIdInSchool } from "@/server/repositories/guardianRepository";
import { findSchoolById } from "@/server/repositories/schoolRepository";
import { findCurrentResponse } from "@/server/repositories/consentRepository";
import {
  findDueNotifications,
  markFailed,
  markSentGuarded,
} from "@/server/repositories/notificationRepository";

// The worker that drains due notifications (FR-08). Eligibility is re-checked at
// SEND time, not just at schedule time, so state changes (a response arriving, a
// consent revoked, the deadline passing) are respected. Idempotency: a job that
// has already reached "sent" is skipped via the status guard in
// markSentGuarded, so re-processing never double-sends.

export interface ProcessResult {
  processed: number;
  sent: number;
  skipped: number;
  failed: number;
}

// Base URL for parent links; the real value comes from config in a real deploy.
function parentLinkBase(): string {
  return process.env.PARENT_LINK_BASE_URL ?? "https://app.example/c";
}

export async function processDueNotifications(
  db: Db,
  provider: EmailProvider,
  now: Date = new Date(),
): Promise<ProcessResult> {
  const due = await findDueNotifications(db, now);
  const result: ProcessResult = { processed: 0, sent: 0, skipped: 0, failed: 0 };

  for (const n of due) {
    result.processed += 1;
    const type = n.type as NotificationType;

    // Load the context needed for eligibility + rendering.
    const event = await findEventByIdInSchool(db, n.schoolId, n.eventId);
    const school = await findSchoolById(db, n.schoolId);
    const guardian = await findGuardianByIdInSchool(db, n.schoolId, n.guardianId);
    const pupil = await findPupilByIdInSchool(db, n.schoolId, n.pupilId);

    if (!event || !school || !guardian || !pupil || guardian.status !== "active") {
      await cancel(db, n.id);
      result.skipped += 1;
      continue;
    }

    // A cancelled event suppresses everything except an explicit change notice.
    if (event.status === "cancelled" && type !== "change_notice") {
      await cancel(db, n.id);
      result.skipped += 1;
      continue;
    }

    const eligible = await isEligible(db, type, {
      schoolId: n.schoolId,
      eventId: n.eventId,
      pupilId: n.pupilId,
      guardianId: n.guardianId,
      consentDeadline: event.consentDeadline,
      now,
    });
    if (!eligible) {
      await cancel(db, n.id);
      result.skipped += 1;
      continue;
    }

    // Build a fresh secure link for actionable messages (issued at send time so
    // the raw token exists only transiently).
    let link: string | undefined;
    if (type === "consent_request" || type === "deadline_reminder" || type === "change_notice") {
      const issued = await issueTokenForRecipient(db, n.schoolId, n.eventId, n.pupilId, n.guardianId);
      link = `${parentLinkBase()}/${issued.raw}`;
    }

    const message = buildEmail(guardian.email, type, {
      schoolName: school.name,
      eventTitle: event.title,
      eventStartsAt: event.startsAt,
      eventLocation: event.location,
      consentDeadline: event.consentDeadline,
      instructions: event.description,
      link,
      formatDate: makeDateFormatter(school.timezone),
    });

    try {
      const { providerMessageId } = await provider.send(message);
      const updated = await markSentGuarded(db, n.id, providerMessageId);
      if (updated > 0) {
        result.sent += 1;
        await recordAudit(db, {
          schoolId: n.schoolId,
          actorType: "system",
          action: "notification.sent",
          entityType: "Notification",
          entityId: n.id,
          metadata: { type },
        });
      } else {
        // Already sent by a prior run — idempotent no-op.
        result.skipped += 1;
      }
    } catch (err) {
      const code = err instanceof EmailDeliveryError ? err.code : "unknown_error";
      await markFailed(db, n.id, code, n.attempts + 1);
      result.failed += 1;
    }
  }

  return result;
}

// Send-time eligibility per type (FR-06 / FR-07).
async function isEligible(
  db: Db,
  type: NotificationType,
  p: {
    schoolId: string;
    eventId: string;
    pupilId: string;
    guardianId: string;
    consentDeadline: Date;
    now: Date;
  },
): Promise<boolean> {
  if (type === "deadline_reminder" || type === "consent_request") {
    // Only while the deadline is still in the future and no response yet.
    if (p.consentDeadline.getTime() <= p.now.getTime()) return false;
    const current = await findCurrentResponse(db, p.schoolId, p.eventId, p.pupilId, p.guardianId);
    return current === null;
  }

  if (type === "event_reminder") {
    // Only to recipients whose CURRENT response is granted.
    const current = await findCurrentResponse(db, p.schoolId, p.eventId, p.pupilId, p.guardianId);
    return current?.response === "granted";
  }

  // change_notice and confirmation are always eligible when reached.
  return true;
}

async function cancel(db: Db, id: string): Promise<void> {
  await db.notification.updateMany({
    where: { id, status: { in: ["scheduled", "failed"] } },
    data: { status: "cancelled" },
  });
}

// Retry guard for admins: notifications that have exhausted attempts stay
// "failed" and visible. Exposed for tests/monitoring.
export function hasExhaustedRetries(attempts: number): boolean {
  return attempts >= MAX_NOTIFICATION_ATTEMPTS;
}
