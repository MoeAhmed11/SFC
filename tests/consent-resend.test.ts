import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { ConflictError, NotFoundError } from "@/server/errors";
import { resendConsentLink } from "@/server/services/consentResendService";
import { submitConsent } from "@/server/services/consentService";
import { issueTokenForRecipient, reissueLink, validateToken } from "@/server/services/secureLinkService";
import { createEventDraft, publishEvent, cancelEvent, completeEvent } from "@/server/services/eventService";
import {
  createPupilWithPrimaryGuardian,
  createSchoolWithAdmin,
  ctxFor,
  futureEventDates,
  resetDb,
} from "./helpers";

// Resend/reissue an individual consent link (Requirement 3 of the MVP admin &
// consent enhancements spec, which also covers the originally separate
// Requirement 4 — a parent changing their mind after the deadline uses the
// exact same mechanism: staff resends, the parent submits through the normal
// consent form with the new link).
//
// resendConsentLink() itself never returns the raw token (by design — it
// only mints and emails it). Where a test needs to exercise the actual
// parent-facing submission through a reissued link, it calls reissueLink()
// directly (the lower-level piece resendConsentLink wraps) to get the raw
// token, exactly as a real reissue-then-email flow would produce one.

async function publishedSetup() {
  const { adminCtx, school } = await createSchoolWithAdmin();
  const { classId, pupilId, guardianId } = await createPupilWithPrimaryGuardian(adminCtx);
  const event = await createEventDraft(prisma, adminCtx, { title: "Museum Trip", ...futureEventDates() });
  await publishEvent(prisma, adminCtx, event.id, { classGroupId: classId });
  return { adminCtx, school, eventId: event.id, pupilId, guardianId };
}

describe("resendConsentLink: capability", () => {
  beforeEach(resetDb);

  it("organiser can resend (consent.resend is granted to organiser)", async () => {
    const { school, eventId, pupilId, guardianId } = await publishedSetup();
    const organiserCtx = ctxFor(school.id, "org-1", "organiser");

    const result = await resendConsentLink(prisma, organiserCtx, { eventId, pupilId, guardianId });
    expect(result.sent).toBe(true);
  });

  it("admin can resend", async () => {
    const { adminCtx, eventId, pupilId, guardianId } = await publishedSetup();
    const result = await resendConsentLink(prisma, adminCtx, { eventId, pupilId, guardianId });
    expect(result.sent).toBe(true);
  });
});

describe("resendConsentLink: event-state guards", () => {
  beforeEach(resetDb);

  it("allows resend BEFORE the consent deadline", async () => {
    const { adminCtx, eventId, pupilId, guardianId } = await publishedSetup();
    const result = await resendConsentLink(prisma, adminCtx, { eventId, pupilId, guardianId });
    expect(result.sent).toBe(true);
  });

  it("allows resend AFTER the consent deadline but before the event starts", async () => {
    const { adminCtx, eventId, pupilId, guardianId } = await publishedSetup();
    // Move the deadline into the past, but the event itself is still ahead.
    await prisma.event.update({
      where: { id: eventId },
      data: { consentDeadline: new Date(Date.now() - 1000) },
    });

    const result = await resendConsentLink(prisma, adminCtx, { eventId, pupilId, guardianId });
    expect(result.sent).toBe(true);
  });

  it("rejects resend once the event has started", async () => {
    const { adminCtx, eventId, pupilId, guardianId } = await publishedSetup();
    await prisma.event.update({
      where: { id: eventId },
      data: { startsAt: new Date(Date.now() - 1000), consentDeadline: new Date(Date.now() - 2000) },
    });

    await expect(
      resendConsentLink(prisma, adminCtx, { eventId, pupilId, guardianId }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("rejects resend for a cancelled event", async () => {
    const { adminCtx, eventId, pupilId, guardianId } = await publishedSetup();
    await cancelEvent(prisma, adminCtx, eventId);

    await expect(
      resendConsentLink(prisma, adminCtx, { eventId, pupilId, guardianId }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("rejects resend for a completed event", async () => {
    const { adminCtx, eventId, pupilId, guardianId } = await publishedSetup();
    await completeEvent(prisma, adminCtx, eventId);

    await expect(
      resendConsentLink(prisma, adminCtx, { eventId, pupilId, guardianId }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("throws NotFoundError for a pupil/guardian/event outside the actor's school", async () => {
    const a = await publishedSetup();
    const b = await createSchoolWithAdmin("School B");

    await expect(
      resendConsentLink(prisma, b.adminCtx, {
        eventId: a.eventId,
        pupilId: a.pupilId,
        guardianId: a.guardianId,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("resendConsentLink: revokes the previous live token", () => {
  beforeEach(resetDb);

  it("marks the previous live token as revoked, distinct from a not-found token", async () => {
    const { adminCtx, eventId, pupilId, guardianId } = await publishedSetup();
    const beforeResend = await issueTokenForRecipient(prisma, adminCtx.schoolId, eventId, pupilId, guardianId);

    await resendConsentLink(prisma, adminCtx, { eventId, pupilId, guardianId });

    const result = await validateToken(prisma, beforeResend.raw);
    expect(result).toEqual({ ok: false, reason: "revoked" });
  });
});

describe("resendConsentLink: the reissued link works past the deadline", () => {
  beforeEach(resetDb);

  it("lets the parent submit through a reissued link even after the deadline has passed", async () => {
    const { adminCtx, eventId, pupilId, guardianId } = await publishedSetup();
    // Deadline already passed; event has not started yet.
    await prisma.event.update({
      where: { id: eventId },
      data: { consentDeadline: new Date(Date.now() - 1000) },
    });

    // resendConsentLink itself performs the reissue + email; call reissueLink
    // separately here purely to obtain the raw token for the assertion below
    // (resendConsentLink never returns it, by design).
    await resendConsentLink(prisma, adminCtx, { eventId, pupilId, guardianId });
    const reissued = await reissueLink(prisma, adminCtx, { eventId, pupilId, guardianId });

    const confirmation = await submitConsent(prisma, reissued.raw, { response: "granted" });
    expect(confirmation.response).toBe("granted");
  });

  it("allows the response to flip either direction across reissues: declined -> granted and granted -> declined", async () => {
    const { adminCtx, school, eventId, pupilId, guardianId } = await publishedSetup();
    // Editing must be allowed: submitConsent's existing-response check is
    // keyed by recipient (not by token), so a second submission for the same
    // recipient is a "correction" under the school's existing editing policy.
    await prisma.school.update({
      where: { id: school.id },
      data: {
        settings: JSON.stringify({
          allowConsentEditing: true,
          allowLateConsent: false,
          allowOfflineConsent: false,
        }),
      },
    });

    const first = await reissueLink(prisma, adminCtx, { eventId, pupilId, guardianId });
    const declineConfirmation = await submitConsent(prisma, first.raw, { response: "declined" });
    expect(declineConfirmation.response).toBe("declined");

    // Parent changes their mind — staff resends, parent grants this time.
    await resendConsentLink(prisma, adminCtx, { eventId, pupilId, guardianId });
    const second = await reissueLink(prisma, adminCtx, { eventId, pupilId, guardianId });
    const grantConfirmation = await submitConsent(prisma, second.raw, { response: "granted" });
    expect(grantConfirmation.response).toBe("granted");

    // And back the other way: granted -> declined.
    await resendConsentLink(prisma, adminCtx, { eventId, pupilId, guardianId });
    const third = await reissueLink(prisma, adminCtx, { eventId, pupilId, guardianId });
    const declineAgain = await submitConsent(prisma, third.raw, { response: "declined" });
    expect(declineAgain.response).toBe("declined");
  });
});
