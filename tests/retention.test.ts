import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { ForbiddenError } from "@/server/errors";
import { DEFAULT_RETENTION_YEARS } from "@/server/schoolSettings";
import { getSchoolSettings, updateSchoolSettings } from "@/server/services/schoolSettingsService";
import { previewRetentionSweep, runRetentionSweep } from "@/server/services/retentionService";
import { createEventDraft, publishEvent } from "@/server/services/eventService";
import { submitConsent } from "@/server/services/consentService";
import { issueTokenForRecipient } from "@/server/services/secureLinkService";
import {
  createSchoolWithAdmin,
  createPupilWithPrimaryGuardian,
  ctxFor,
  futureEventDates,
  resetDb,
} from "./helpers";

const YEAR_MS = 365 * 24 * 3600 * 1000;

describe("data retention default and configuration (spec decision 17.9)", () => {
  beforeEach(resetDb);

  it("defaults to 3 years", async () => {
    const { adminCtx } = await createSchoolWithAdmin();
    const settings = await getSchoolSettings(prisma, adminCtx);
    expect(settings.dataRetentionYears).toEqual(3);
    expect(DEFAULT_RETENTION_YEARS).toEqual(3);
  });

  it("is configurable by an admin, audited, and bounded to a sane range", async () => {
    const { school, adminCtx } = await createSchoolWithAdmin();
    const updated = await updateSchoolSettings(prisma, adminCtx, { dataRetentionYears: 5 });
    expect(updated.dataRetentionYears).toEqual(5);

    const entry = await prisma.auditLog.findFirst({
      where: { schoolId: school.id, action: "school.settings_updated" },
    });
    expect(JSON.parse(entry!.metadata).dataRetentionYears).toEqual(5);

    await expect(updateSchoolSettings(prisma, adminCtx, { dataRetentionYears: 50 })).rejects.toThrow(
      /between/,
    );
    await expect(updateSchoolSettings(prisma, adminCtx, { dataRetentionYears: 0 })).rejects.toThrow(
      /between/,
    );
  });

  it("organiser cannot view or change retention settings", async () => {
    const { school } = await createSchoolWithAdmin();
    const organiserCtx = ctxFor(school.id, "org-1", "organiser");
    await expect(previewRetentionSweep(prisma, organiserCtx)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(runRetentionSweep(prisma, organiserCtx)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("retention sweep scoping", () => {
  beforeEach(resetDb);

  async function setupSupersededResponse(adminCtx: Awaited<ReturnType<typeof createSchoolWithAdmin>>["adminCtx"], schoolId: string) {
    const { classId, pupilId, guardianId } = await createPupilWithPrimaryGuardian(adminCtx);
    const event = await createEventDraft(prisma, adminCtx, { title: "Trip", ...futureEventDates() });
    await publishEvent(prisma, adminCtx, event.id, { classGroupId: classId });
    await prisma.school.update({
      where: { id: schoolId },
      data: { settings: JSON.stringify({ allowConsentEditing: true }) },
    });
    const token = await issueTokenForRecipient(prisma, schoolId, event.id, pupilId, guardianId);
    await submitConsent(prisma, token.raw, { response: "granted" });
    // A correction supersedes the first response.
    await submitConsent(prisma, token.raw, { response: "declined" });
    return { eventId: event.id, pupilId, guardianId };
  }

  it("never deletes the CURRENT consent response, only superseded ones, regardless of age", async () => {
    const { school, adminCtx } = await createSchoolWithAdmin();
    const { eventId, pupilId, guardianId } = await setupSupersededResponse(adminCtx, school.id);

    // Age everything well past the default 3-year retention.
    const old = new Date(Date.now() - 5 * YEAR_MS);
    await prisma.consentResponse.updateMany({
      where: { schoolId: school.id, eventId, pupilId, guardianId },
      data: { submittedAt: old },
    });

    const preview = await previewRetentionSweep(prisma, adminCtx);
    expect(preview.supersededConsentResponses).toEqual(1);

    const swept = await runRetentionSweep(prisma, adminCtx);
    expect(swept.supersededConsentResponses).toEqual(1);

    const remaining = await prisma.consentResponse.findMany({
      where: { schoolId: school.id, eventId, pupilId, guardianId },
    });
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.state).toEqual("current");
    expect(remaining[0]?.response).toEqual("declined");
  });

  it("does not delete records within the retention window", async () => {
    const { school, adminCtx } = await createSchoolWithAdmin();
    await setupSupersededResponse(adminCtx, school.id);
    // Records were just created — well within the 3-year default window.

    const preview = await previewRetentionSweep(prisma, adminCtx);
    expect(preview.supersededConsentResponses).toEqual(0);
    expect(preview.notifications).toEqual(0);
    expect(preview.auditLogs).toEqual(0);

    const swept = await runRetentionSweep(prisma, adminCtx);
    expect(swept.supersededConsentResponses).toEqual(0);
  });

  it("respects a school's configured retention period, not just the default", async () => {
    const { school, adminCtx } = await createSchoolWithAdmin();
    await setupSupersededResponse(adminCtx, school.id);

    // Age the superseded response 2 years back — within the 3-year default,
    // but outside a school-configured 1-year retention.
    await prisma.consentResponse.updateMany({
      where: { schoolId: school.id, state: "superseded" },
      data: { submittedAt: new Date(Date.now() - 2 * YEAR_MS) },
    });

    const defaultPreview = await previewRetentionSweep(prisma, adminCtx);
    expect(defaultPreview.supersededConsentResponses).toEqual(0);

    await updateSchoolSettings(prisma, adminCtx, { dataRetentionYears: 1 });
    const shorterPreview = await previewRetentionSweep(prisma, adminCtx);
    expect(shorterPreview.supersededConsentResponses).toEqual(1);
  });

  it("only sweeps the acting school, never another tenant's data", async () => {
    const a = await createSchoolWithAdmin("School A");
    const b = await createSchoolWithAdmin("School B");
    await setupSupersededResponse(a.adminCtx, a.school.id);

    // Age School A's superseded response well past retention.
    await prisma.consentResponse.updateMany({
      where: { schoolId: a.school.id, state: "superseded" },
      data: { submittedAt: new Date(Date.now() - 5 * YEAR_MS) },
    });

    // Sweeping School B must not touch School A's data.
    const sweptB = await runRetentionSweep(prisma, b.adminCtx);
    expect(sweptB.supersededConsentResponses).toEqual(0);

    const stillThere = await prisma.consentResponse.findMany({
      where: { schoolId: a.school.id, state: "superseded" },
    });
    expect(stillThere).toHaveLength(1);

    // Sweeping School A does remove it.
    const sweptA = await runRetentionSweep(prisma, a.adminCtx);
    expect(sweptA.supersededConsentResponses).toEqual(1);
  });

  it("sweep is audited with counts only", async () => {
    const { school, adminCtx } = await createSchoolWithAdmin();
    await setupSupersededResponse(adminCtx, school.id);
    await prisma.consentResponse.updateMany({
      where: { schoolId: school.id, state: "superseded" },
      data: { submittedAt: new Date(Date.now() - 5 * YEAR_MS) },
    });

    await runRetentionSweep(prisma, adminCtx);

    const entry = await prisma.auditLog.findFirst({
      where: { schoolId: school.id, action: "retention.swept" },
    });
    expect(entry).not.toBeNull();
    const meta = JSON.parse(entry!.metadata);
    expect(meta.supersededConsentResponses).toEqual(1);
    expect(meta.retentionYears).toEqual(3);
  });
});
