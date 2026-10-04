import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { ConflictError, NotFoundError } from "@/server/errors";
import { recordOfflineConsent } from "@/server/services/offlineConsentService";
import { submitConsent } from "@/server/services/consentService";
import { reissueLink } from "@/server/services/secureLinkService";
import { createEventDraft, publishEvent, cancelEvent, completeEvent } from "@/server/services/eventService";
import {
  createPupilWithPrimaryGuardian,
  createSchoolWithAdmin,
  ctxFor,
  futureEventDates,
  resetDb,
} from "./helpers";

// Staff recording a parent's consent decision given offline (decision 17.5,
// Requirement 6 of the MVP admin & consent enhancements spec). Gated on the
// school's allowOfflineConsent setting (off by default) and the
// consent.record_offline capability (admin + organiser).

async function publishedSetup(opts?: { offline?: boolean }) {
  const { adminCtx, school } = await createSchoolWithAdmin();
  await prisma.school.update({
    where: { id: school.id },
    data: {
      settings: JSON.stringify({
        allowConsentEditing: false,
        allowLateConsent: false,
        allowOfflineConsent: opts?.offline === true,
      }),
    },
  });
  const { classId, pupilId, guardianId } = await createPupilWithPrimaryGuardian(adminCtx);
  const event = await createEventDraft(prisma, adminCtx, { title: "Museum Trip", ...futureEventDates() });
  await publishEvent(prisma, adminCtx, event.id, { classGroupId: classId });
  return { adminCtx, school, eventId: event.id, pupilId, guardianId };
}

describe("recordOfflineConsent: setting gate", () => {
  beforeEach(resetDb);

  it("rejects when allowOfflineConsent is off (the default)", async () => {
    const { adminCtx, eventId, pupilId, guardianId } = await publishedSetup({ offline: false });

    await expect(
      recordOfflineConsent(prisma, adminCtx, { eventId, pupilId, guardianId, response: "granted" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("succeeds when allowOfflineConsent is on", async () => {
    const { adminCtx, eventId, pupilId, guardianId } = await publishedSetup({ offline: true });

    const result = await recordOfflineConsent(prisma, adminCtx, {
      eventId,
      pupilId,
      guardianId,
      response: "granted",
    });
    expect(result.response).toBe("granted");
  });
});

describe("recordOfflineConsent: capability", () => {
  beforeEach(resetDb);

  it("organiser can record (consent.record_offline is granted to organiser)", async () => {
    const { school, eventId, pupilId, guardianId } = await publishedSetup({ offline: true });
    const organiserCtx = ctxFor(school.id, "org-1", "organiser");

    const result = await recordOfflineConsent(prisma, organiserCtx, {
      eventId,
      pupilId,
      guardianId,
      response: "declined",
    });
    expect(result.response).toBe("declined");
  });
});

describe("recordOfflineConsent: event-state guards", () => {
  beforeEach(resetDb);

  it("rejects once the event has started", async () => {
    const { adminCtx, eventId, pupilId, guardianId } = await publishedSetup({ offline: true });
    await prisma.event.update({
      where: { id: eventId },
      data: { startsAt: new Date(Date.now() - 1000), consentDeadline: new Date(Date.now() - 2000) },
    });

    await expect(
      recordOfflineConsent(prisma, adminCtx, { eventId, pupilId, guardianId, response: "granted" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("rejects for a cancelled event", async () => {
    const { adminCtx, eventId, pupilId, guardianId } = await publishedSetup({ offline: true });
    await cancelEvent(prisma, adminCtx, eventId);

    await expect(
      recordOfflineConsent(prisma, adminCtx, { eventId, pupilId, guardianId, response: "granted" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("rejects for a completed event", async () => {
    const { adminCtx, eventId, pupilId, guardianId } = await publishedSetup({ offline: true });
    await completeEvent(prisma, adminCtx, eventId);

    await expect(
      recordOfflineConsent(prisma, adminCtx, { eventId, pupilId, guardianId, response: "granted" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("throws NotFoundError for a pupil/guardian/event outside the actor's school", async () => {
    const a = await publishedSetup({ offline: true });
    const b = await createSchoolWithAdmin("School B");
    await prisma.school.update({
      where: { id: b.school.id },
      data: { settings: JSON.stringify({ allowOfflineConsent: true }) },
    });

    await expect(
      recordOfflineConsent(prisma, b.adminCtx, {
        eventId: a.eventId,
        pupilId: a.pupilId,
        guardianId: a.guardianId,
        response: "granted",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("recordOfflineConsent: bypasses deadline and editing-lock restrictions", () => {
  beforeEach(resetDb);

  it("still works after the consent deadline has passed, without allowLateConsent", async () => {
    const { adminCtx, eventId, pupilId, guardianId } = await publishedSetup({ offline: true });
    await prisma.event.update({
      where: { id: eventId },
      data: { consentDeadline: new Date(Date.now() - 1000) },
    });

    const result = await recordOfflineConsent(prisma, adminCtx, {
      eventId,
      pupilId,
      guardianId,
      response: "granted",
    });
    expect(result.response).toBe("granted");
  });

  it("overwrites an existing current response even without allowConsentEditing", async () => {
    const { adminCtx, eventId, pupilId, guardianId } = await publishedSetup({ offline: true });

    const first = await recordOfflineConsent(prisma, adminCtx, {
      eventId,
      pupilId,
      guardianId,
      response: "declined",
    });
    expect(first.response).toBe("declined");

    const second = await recordOfflineConsent(prisma, adminCtx, {
      eventId,
      pupilId,
      guardianId,
      response: "granted",
    });
    expect(second.response).toBe("granted");

    const current = await prisma.consentResponse.findFirst({
      where: { schoolId: adminCtx.schoolId, eventId, pupilId, guardianId, state: "current" },
    });
    expect(current?.response).toBe("granted");

    const superseded = await prisma.consentResponse.findMany({
      where: { schoolId: adminCtx.schoolId, eventId, pupilId, guardianId, state: "superseded" },
    });
    expect(superseded).toHaveLength(1);
    expect(superseded[0]?.response).toBe("declined");
  });
});

describe("recordOfflineConsent: provenance", () => {
  beforeEach(resetDb);

  it("marks the created response source as staff, with the recording staff user id", async () => {
    const { adminCtx, eventId, pupilId, guardianId } = await publishedSetup({ offline: true });

    await recordOfflineConsent(prisma, adminCtx, { eventId, pupilId, guardianId, response: "granted" });

    const current = await prisma.consentResponse.findFirst({
      where: { schoolId: adminCtx.schoolId, eventId, pupilId, guardianId, state: "current" },
    });
    expect(current?.source).toBe("staff");
    expect(current?.recordedByStaffUserId).toBe(adminCtx.staffUserId);
  });

  it("a normal parent submission still defaults to source parent", async () => {
    const { adminCtx, eventId, pupilId, guardianId } = await publishedSetup({ offline: true });
    const issued = await reissueLink(prisma, adminCtx, { eventId, pupilId, guardianId });

    await submitConsent(prisma, issued.raw, { response: "granted" });

    const current = await prisma.consentResponse.findFirst({
      where: { schoolId: adminCtx.schoolId, eventId, pupilId, guardianId, state: "current" },
    });
    expect(current?.source).toBe("parent");
    expect(current?.recordedByStaffUserId).toBeNull();
  });
});

describe("recordOfflineConsent: audit", () => {
  beforeEach(resetDb);

  it("records an audit entry with the response and recipient, no notes content leaked into metadata beyond what's expected", async () => {
    const { adminCtx, eventId, pupilId, guardianId } = await publishedSetup({ offline: true });

    await recordOfflineConsent(prisma, adminCtx, {
      eventId,
      pupilId,
      guardianId,
      response: "granted",
      notes: "Signed paper form returned 14 Oct",
    });

    const entry = await prisma.auditLog.findFirst({
      where: { schoolId: adminCtx.schoolId, action: "consent.recorded_offline" },
    });
    expect(entry).not.toBeNull();
    expect(entry?.actorType).toBe("staff");
    expect(entry?.actorId).toBe(adminCtx.staffUserId);
    const metadata = JSON.parse(entry!.metadata);
    expect(metadata).toEqual({ response: "granted", pupilId, guardianId });
  });
});
