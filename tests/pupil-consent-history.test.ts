import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { NotFoundError } from "@/server/errors";
import { getPupilConsentHistory } from "@/server/services/dataService";
import { submitConsent } from "@/server/services/consentService";
import { issueTokenForRecipient } from "@/server/services/secureLinkService";
import { createEventDraft, publishEvent } from "@/server/services/eventService";
import { createPupilWithPrimaryGuardian, createSchoolWithAdmin, futureEventDates, resetDb } from "./helpers";

// Consent history per pupil, across ALL events (Requirement 2 of the MVP
// admin & consent enhancements spec).

describe("getPupilConsentHistory", () => {
  beforeEach(resetDb);

  it("returns responses across multiple events, newest first, including a superseded row", async () => {
    const { adminCtx, school } = await createSchoolWithAdmin();
    // Editing enabled on this school so the second submission for event A can
    // supersede the first, exercising the superseded-row case.
    await prisma.school.update({
      where: { id: school.id },
      data: { settings: JSON.stringify({ allowConsentEditing: true, allowLateConsent: false, allowOfflineConsent: false }) },
    });

    const { classId, pupilId, guardianId } = await createPupilWithPrimaryGuardian(adminCtx);

    const eventA = await createEventDraft(prisma, adminCtx, { title: "Museum Trip", ...futureEventDates(30) });
    await publishEvent(prisma, adminCtx, eventA.id, { classGroupId: classId });
    const tokenA1 = await issueTokenForRecipient(prisma, school.id, eventA.id, pupilId, guardianId);
    await submitConsent(prisma, tokenA1.raw, { response: "granted" });
    // Change of mind on the same event — supersedes the "granted" response.
    const tokenA2 = await issueTokenForRecipient(prisma, school.id, eventA.id, pupilId, guardianId);
    await submitConsent(prisma, tokenA2.raw, { response: "declined" });

    const eventB = await createEventDraft(prisma, adminCtx, { title: "Swimming Gala", ...futureEventDates(60) });
    await publishEvent(prisma, adminCtx, eventB.id, { classGroupId: classId });
    const tokenB = await issueTokenForRecipient(prisma, school.id, eventB.id, pupilId, guardianId);
    await submitConsent(prisma, tokenB.raw, { response: "granted" });

    const history = await getPupilConsentHistory(prisma, adminCtx, pupilId);

    // All three rows (2 for event A: current+superseded, 1 for event B) are present.
    expect(history).toHaveLength(3);

    // Newest first.
    for (let i = 1; i < history.length; i++) {
      expect(history[i - 1]!.submittedAt.getTime()).toBeGreaterThanOrEqual(history[i]!.submittedAt.getTime());
    }

    const eventTitles = history.map((h) => h.event.title);
    expect(eventTitles).toContain("Museum Trip");
    expect(eventTitles).toContain("Swimming Gala");

    const forEventA = history.filter((h) => h.event.title === "Museum Trip");
    expect(forEventA).toHaveLength(2);
    const current = forEventA.find((h) => h.state === "current");
    const superseded = forEventA.find((h) => h.state === "superseded");
    expect(current?.response).toEqual("declined");
    expect(superseded?.response).toEqual("granted");

    const forEventB = history.filter((h) => h.event.title === "Swimming Gala");
    expect(forEventB).toHaveLength(1);
    expect(forEventB[0]?.state).toEqual("current");
    expect(forEventB[0]?.response).toEqual("granted");
    expect(forEventB[0]?.guardian.name).toEqual("Primary Guardian");
  });

  it("returns an empty list for a pupil with no consent responses yet", async () => {
    const { adminCtx } = await createSchoolWithAdmin();
    const { pupilId } = await createPupilWithPrimaryGuardian(adminCtx);

    const history = await getPupilConsentHistory(prisma, adminCtx, pupilId);
    expect(history).toEqual([]);
  });

  it("throws NotFoundError for a pupil in a different school (tenant isolation)", async () => {
    const a = await createSchoolWithAdmin("School A");
    const b = await createSchoolWithAdmin("School B");
    const { pupilId } = await createPupilWithPrimaryGuardian(b.adminCtx);

    await expect(getPupilConsentHistory(prisma, a.adminCtx, pupilId)).rejects.toBeInstanceOf(NotFoundError);
  });
});
