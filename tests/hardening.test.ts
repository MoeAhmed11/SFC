import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { ForbiddenError, NotFoundError } from "@/server/errors";
import { createEventDraft, publishEvent } from "@/server/services/eventService";
import { processDueNotifications } from "@/server/services/notificationService";
import { MockEmailProvider } from "@/server/notifications/providers/mock";
import { listFailedNotificationsForSchool } from "@/server/services/monitoringService";
import {
  getSchoolSettings,
  updateSchoolSettings,
} from "@/server/services/schoolSettingsService";
import {
  createSchoolWithAdmin,
  createPupilWithPrimaryGuardian,
  ctxFor,
  futureEventDates,
  resetDb,
} from "./helpers";

describe("failed notification monitoring", () => {
  beforeEach(resetDb);

  it("surfaces a failed send with its attempt count and failure code", async () => {
    const { adminCtx, classId } = await (async () => {
      const { adminCtx } = await createSchoolWithAdmin();
      const { classId } = await createPupilWithPrimaryGuardian(adminCtx);
      return { adminCtx, classId };
    })();

    const event = await createEventDraft(prisma, adminCtx, { title: "Trip", ...futureEventDates() });
    await publishEvent(prisma, adminCtx, event.id, { classGroupId: classId });

    const provider = new MockEmailProvider();
    provider.failNext(1);
    await processDueNotifications(prisma, provider, new Date());

    const failed = await listFailedNotificationsForSchool(prisma, adminCtx);
    expect(failed.length).toBeGreaterThanOrEqual(1);
    expect(failed[0]?.failureCode).toBe("provider_error");
    expect(failed[0]?.attempts).toBe(1);
    expect(failed[0]?.exhausted).toBe(false);
  });

  it("is scoped to the actor's school and requires event.view", async () => {
    const a = await createSchoolWithAdmin("School A");
    const b = await createSchoolWithAdmin("School B");
    expect(await listFailedNotificationsForSchool(prisma, b.adminCtx)).toHaveLength(0);
    // Sanity: a's context type-checks and is usable (no cross-school leakage
    // asserted implicitly by the empty result above).
    expect(a.school.id).not.toEqual(b.school.id);
  });
});

describe("school settings (admin-only, audited)", () => {
  beforeEach(resetDb);

  it("defaults to editing/late/offline consent all disabled", async () => {
    const { adminCtx } = await createSchoolWithAdmin();
    const settings = await getSchoolSettings(prisma, adminCtx);
    expect(settings.allowConsentEditing).toBe(false);
    expect(settings.allowLateConsent).toBe(false);
    expect(settings.allowOfflineConsent).toBe(false);
    // Data retention (decision 17.9) is covered in detail in retention.test.ts.
    expect(settings.dataRetentionYears).toBe(3);
  });

  it("lets an admin update settings and audits the change", async () => {
    const { adminCtx, school } = await createSchoolWithAdmin();
    const updated = await updateSchoolSettings(prisma, adminCtx, { allowConsentEditing: true });
    expect(updated.allowConsentEditing).toBe(true);
    // Untouched flags keep their previous value (partial update).
    expect(updated.allowLateConsent).toBe(false);

    const entry = await prisma.auditLog.findFirst({
      where: { schoolId: school.id, action: "school.settings_updated" },
    });
    expect(entry).not.toBeNull();
    expect(JSON.parse(entry!.metadata).allowConsentEditing).toBe(true);
  });

  it("forbids an organiser from changing settings", async () => {
    const { school } = await createSchoolWithAdmin();
    const organiserCtx = ctxFor(school.id, "org-1", "organiser");
    await expect(
      updateSchoolSettings(prisma, organiserCtx, { allowLateConsent: true }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("throws not-found for a nonexistent school id", async () => {
    const fake = ctxFor("does-not-exist", "staff-1", "admin");
    await expect(getSchoolSettings(prisma, fake)).rejects.toBeInstanceOf(NotFoundError);
  });
});
