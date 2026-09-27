import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { ConflictError, UnauthenticatedError } from "@/server/errors";
import { getConsentView, submitConsent } from "@/server/services/consentService";
import { issueTokenForRecipient } from "@/server/services/secureLinkService";
import { listResponsesForRecipient } from "@/server/repositories/consentRepository";
import { createEventDraft, publishEvent } from "@/server/services/eventService";
import {
  createSchoolWithAdmin,
  createPupilWithPrimaryGuardian,
  futureEventDates,
  resetDb,
} from "./helpers";

// Sets up a published event with one recipient and returns a valid raw token
// for that recipient.
async function publishedWithToken(opts?: { editing?: boolean; late?: boolean }) {
  const { adminCtx, school } = await createSchoolWithAdmin();
  if (opts?.editing || opts?.late) {
    await prisma.school.update({
      where: { id: school.id },
      data: {
        settings: JSON.stringify({
          allowConsentEditing: opts?.editing === true,
          allowLateConsent: opts?.late === true,
          allowOfflineConsent: false,
        }),
      },
    });
  }
  const { classId, pupilId, guardianId } = await createPupilWithPrimaryGuardian(adminCtx);
  const event = await createEventDraft(prisma, adminCtx, { title: "Museum Trip", ...futureEventDates() });
  await publishEvent(prisma, adminCtx, event.id, { classGroupId: classId });
  const token = await issueTokenForRecipient(prisma, school.id, event.id, pupilId, guardianId);
  return { adminCtx, school, eventId: event.id, pupilId, guardianId, raw: token.raw };
}

describe("consent view", () => {
  beforeEach(resetDb);

  it("resolves a valid token to the scoped event + pupil only", async () => {
    const { raw, pupilId } = await publishedWithToken();
    const view = await getConsentView(prisma, raw);
    expect(view.event.title).toBe("Museum Trip");
    expect(view.pupilName).toContain("Kid");
    expect(view.currentResponse).toBeNull();
    // Sanity: the view exposes the bound pupil, and pupilId is not leaked in it.
    expect(JSON.stringify(view)).not.toContain(pupilId);
  });

  it("gives a single generic error for an invalid link", async () => {
    await expect(getConsentView(prisma, "nope")).rejects.toBeInstanceOf(UnauthenticatedError);
  });
});

describe("consent submission", () => {
  beforeEach(resetDb);

  it("captures a granted response and confirms it", async () => {
    const { raw, eventId, pupilId, guardianId, school } = await publishedWithToken();
    const confirmation = await submitConsent(prisma, raw, { response: "granted" });
    expect(confirmation.response).toBe("granted");
    expect(confirmation.eventTitle).toBe("Museum Trip");

    const responses = await listResponsesForRecipient(prisma, school.id, eventId, pupilId, guardianId);
    expect(responses).toHaveLength(1);
    expect(responses[0]?.state).toBe("current");
  });

  it("captures a declined response distinct from no response", async () => {
    const { raw } = await publishedWithToken();
    const confirmation = await submitConsent(prisma, raw, { response: "declined" });
    expect(confirmation.response).toBe("declined");
  });

  it("never infers consent from silence (no response = nothing stored)", async () => {
    const { raw, eventId, pupilId, guardianId, school } = await publishedWithToken();
    // Merely viewing must not create any response.
    await getConsentView(prisma, raw);
    const responses = await listResponsesForRecipient(prisma, school.id, eventId, pupilId, guardianId);
    expect(responses).toHaveLength(0);
  });

  it("rejects an invalid response value", async () => {
    const { raw } = await publishedWithToken();
    await expect(submitConsent(prisma, raw, { response: "maybe" })).rejects.toBeTruthy();
  });

  it("blocks a second response when editing is disabled (default)", async () => {
    const { raw } = await publishedWithToken();
    await submitConsent(prisma, raw, { response: "granted" });
    await expect(submitConsent(prisma, raw, { response: "declined" })).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("allows a correction when editing is enabled, retaining prior as superseded", async () => {
    const { raw, eventId, pupilId, guardianId, school } = await publishedWithToken({ editing: true });
    await submitConsent(prisma, raw, { response: "granted" });
    const confirmation = await submitConsent(prisma, raw, { response: "declined" });
    expect(confirmation.response).toBe("declined");

    const responses = await listResponsesForRecipient(prisma, school.id, eventId, pupilId, guardianId);
    expect(responses).toHaveLength(2);
    const current = responses.filter((r) => r.state === "current");
    const superseded = responses.filter((r) => r.state === "superseded");
    expect(current).toHaveLength(1);
    expect(current[0]?.response).toBe("declined");
    expect(superseded).toHaveLength(1);
    expect(superseded[0]?.response).toBe("granted");
  });

  it("blocks consent after the deadline (default late-consent off)", async () => {
    const { raw, eventId } = await publishedWithToken();
    // Move the deadline into the past.
    await prisma.event.update({
      where: { id: eventId },
      data: { consentDeadline: new Date(Date.now() - 1000) },
    });
    await expect(submitConsent(prisma, raw, { response: "granted" })).rejects.toBeInstanceOf(ConflictError);
  });

  it("blocks consent once the event is cancelled (tokens revoked)", async () => {
    const { raw, eventId, adminCtx } = await publishedWithToken();
    const { cancelEvent } = await import("@/server/services/eventService");
    await cancelEvent(prisma, adminCtx, eventId);
    // Token was revoked on cancel -> generic invalid-link error.
    await expect(submitConsent(prisma, raw, { response: "granted" })).rejects.toBeInstanceOf(
      UnauthenticatedError,
    );
  });
});
