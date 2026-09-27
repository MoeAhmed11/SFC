import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { createEventDraft, publishEvent, cancelEvent } from "@/server/services/eventService";
import { issueTokenForRecipient } from "@/server/services/secureLinkService";
import { submitConsent } from "@/server/services/consentService";
import { processDueNotifications } from "@/server/services/notificationService";
import { MockEmailProvider } from "@/server/notifications/providers/mock";
import { listForEvent } from "@/server/repositories/notificationRepository";
import {
  createSchoolWithAdmin,
  createPupilWithPrimaryGuardian,
  futureEventDates,
  resetDb,
} from "./helpers";

// Publishes an event with `count` recipients and returns identities + tokens.
async function publishEventWithRecipients(count: number) {
  const { adminCtx, school } = await createSchoolWithAdmin();
  const className = "Year 2";
  let classId = "";
  for (let i = 0; i < count; i++) {
    const r = await createPupilWithPrimaryGuardian(adminCtx, { className, email: `g${i}@example.test` });
    classId = r.classId;
  }
  const event = await createEventDraft(prisma, adminCtx, {
    title: "Farm Visit",
    description: "Bring wellies.",
    ...futureEventDates(30),
  });
  await publishEvent(prisma, adminCtx, event.id, { classGroupId: classId });
  const rows = await prisma.eventRecipient.findMany({ where: { schoolId: school.id, eventId: event.id } });
  const tokens: Record<string, string> = {};
  for (const row of rows) {
    const t = await issueTokenForRecipient(prisma, school.id, event.id, row.pupilId, row.guardianId);
    tokens[row.guardianId] = t.raw;
  }
  return { adminCtx, school, eventId: event.id, recipients: rows, tokens };
}

describe("scheduling on publish", () => {
  beforeEach(resetDb);

  it("schedules a consent request + deadline reminders + event reminder per recipient", async () => {
    const { school, eventId } = await publishEventWithRecipients(1);
    const notifications = await listForEvent(prisma, school.id, eventId);
    const types = notifications.map((n) => n.type).sort();
    // consent_request + 3 deadline reminders (7/3/1d) + 1 event reminder.
    expect(notifications.length).toBe(5);
    expect(types.filter((t) => t === "deadline_reminder")).toHaveLength(3);
    expect(types.filter((t) => t === "event_reminder")).toHaveLength(1);
    expect(types.filter((t) => t === "consent_request")).toHaveLength(1);
  });

  it("re-publishing does not create duplicate notifications (idempotent)", async () => {
    const { adminCtx, school, eventId } = await publishEventWithRecipients(1);
    // Attempt to schedule again via the scheduler directly (simulating a retry).
    const { scheduleEventNotifications } = await import("@/server/services/reminderScheduler");
    const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
    const recips = await prisma.eventRecipient.findMany({ where: { eventId } });
    const created = await scheduleEventNotifications(prisma, {
      schoolId: school.id,
      eventId,
      consentDeadline: event.consentDeadline,
      eventStartsAt: event.startsAt,
      recipients: recips.map((r) => ({ pupilId: r.pupilId, guardianId: r.guardianId })),
    });
    expect(created).toBe(0); // all already present
    expect((await listForEvent(prisma, school.id, eventId)).length).toBe(5);
    expect(adminCtx).toBeTruthy();
  });
});

describe("worker delivery + idempotency", () => {
  beforeEach(resetDb);

  it("sends the consent request and does not resend on a second run", async () => {
    const { school, eventId } = await publishEventWithRecipients(1);
    const provider = new MockEmailProvider();

    const first = await processDueNotifications(prisma, provider, new Date());
    expect(first.sent).toBeGreaterThanOrEqual(1);
    const sentCount = provider.sent.length;

    // Re-run immediately: already-sent notifications must not send again.
    const second = await processDueNotifications(prisma, provider, new Date());
    expect(second.sent).toBe(0);
    expect(provider.sent.length).toBe(sentCount);
  });

  it("emails contain no child personal data", async () => {
    const { school, eventId, recipients } = await publishEventWithRecipients(1);
    // Give the pupil a distinctive name to detect leaks.
    await prisma.pupil.update({
      where: { id: recipients[0]!.pupilId },
      data: { firstName: "Zephyrina", lastName: "Quibblesworth" },
    });
    const provider = new MockEmailProvider();
    await processDueNotifications(prisma, provider, new Date());

    for (const msg of provider.sent) {
      expect(msg.subject).not.toContain("Zephyrina");
      expect(msg.text).not.toContain("Zephyrina");
      expect(msg.text).not.toContain("Quibblesworth");
    }
    expect(school).toBeTruthy();
    expect(eventId).toBeTruthy();
  });

  it("records failure code when the provider fails, leaving it retryable", async () => {
    await publishEventWithRecipients(1);
    const provider = new MockEmailProvider();
    provider.failNext(1);

    const res = await processDueNotifications(prisma, provider, new Date());
    expect(res.failed).toBeGreaterThanOrEqual(1);
    const failed = await prisma.notification.findFirst({ where: { status: "failed" } });
    expect(failed?.failureCode).toBe("provider_error");
    expect(failed?.attempts).toBe(1);
  });
});

describe("send-time eligibility", () => {
  beforeEach(resetDb);

  it("skips deadline reminders once the recipient has responded", async () => {
    const { school, eventId, recipients, tokens } = await publishEventWithRecipients(1);
    const guardianId = recipients[0]!.guardianId;
    // Respond first.
    await submitConsent(prisma, tokens[guardianId]!, { response: "granted" });

    // Make the deadline reminders due by moving their scheduledAt into the past.
    await prisma.notification.updateMany({
      where: { eventId, type: "deadline_reminder" },
      data: { scheduledAt: new Date(Date.now() - 1000) },
    });
    const provider = new MockEmailProvider();
    await processDueNotifications(prisma, provider, new Date());

    // No deadline reminder should have been sent (recipient already responded).
    const deadlineNotifs = (await listForEvent(prisma, school.id, eventId)).filter(
      (n) => n.type === "deadline_reminder",
    );
    expect(deadlineNotifs.every((n) => n.status !== "sent")).toBe(true);
  });

  it("sends event reminders only to recipients who consented", async () => {
    const { school, eventId, recipients, tokens } = await publishEventWithRecipients(2);
    const consenting = recipients[0]!;
    await submitConsent(prisma, tokens[consenting.guardianId]!, { response: "granted" });
    // recipients[1] does not consent.

    // Make event reminders due.
    await prisma.notification.updateMany({
      where: { eventId, type: "event_reminder" },
      data: { scheduledAt: new Date(Date.now() - 1000) },
    });
    const provider = new MockEmailProvider();
    await processDueNotifications(prisma, provider, new Date());

    const eventReminders = (await listForEvent(prisma, school.id, eventId)).filter(
      (n) => n.type === "event_reminder",
    );
    const sent = eventReminders.filter((n) => n.status === "sent");
    const cancelled = eventReminders.filter((n) => n.status === "cancelled");
    expect(sent).toHaveLength(1);
    expect(cancelled).toHaveLength(1);
  });

  it("cancelling an event suppresses pending notifications", async () => {
    const { adminCtx, school, eventId } = await publishEventWithRecipients(1);
    await cancelEvent(prisma, adminCtx, eventId);
    const notifs = await listForEvent(prisma, school.id, eventId);
    expect(notifs.every((n) => n.status === "cancelled")).toBe(true);
  });
});
