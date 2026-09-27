import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { NotFoundError } from "@/server/errors";
import { createEventDraft, publishEvent } from "@/server/services/eventService";
import { issueTokenForRecipient } from "@/server/services/secureLinkService";
import { submitConsent } from "@/server/services/consentService";
import {
  getEventDashboard,
  getEventResponses,
} from "@/server/services/dashboardService";
import { exportConsentRegister } from "@/server/services/exportService";
import { parseCsv } from "@/server/csv/parse";
import {
  createSchoolWithAdmin,
  createPupilWithPrimaryGuardian,
  ctxFor,
  futureEventDates,
  resetDb,
} from "./helpers";

// Builds a published event with `count` recipients, each an active pupil with a
// primary-contact guardian in the same class. Returns per-recipient tokens so
// tests can submit responses.
async function publishedEventWithRecipients(count: number) {
  const { adminCtx, school } = await createSchoolWithAdmin();
  const className = "Year 5";
  const recipients: { pupilId: string; guardianId: string; raw: string }[] = [];
  let classId = "";
  for (let i = 0; i < count; i++) {
    const r = await createPupilWithPrimaryGuardian(adminCtx, {
      className,
      email: `g${i}@example.test`,
    });
    classId = r.classId;
  }
  const event = await createEventDraft(prisma, adminCtx, { title: "Sports Day", ...futureEventDates() });
  await publishEvent(prisma, adminCtx, event.id, { classGroupId: classId });

  // Collect recipient identities and issue a token each for consent submission.
  const rows = await prisma.eventRecipient.findMany({ where: { schoolId: school.id, eventId: event.id } });
  for (const row of rows) {
    const t = await issueTokenForRecipient(prisma, school.id, event.id, row.pupilId, row.guardianId);
    recipients.push({ pupilId: row.pupilId, guardianId: row.guardianId, raw: t.raw });
  }
  return { adminCtx, school, eventId: event.id, recipients };
}

describe("dashboard totals", () => {
  beforeEach(resetDb);

  it("reconciles: consented + declined + outstanding = invited", async () => {
    const { adminCtx, eventId, recipients } = await publishedEventWithRecipients(4);
    await submitConsent(prisma, recipients[0]!.raw, { response: "granted" });
    await submitConsent(prisma, recipients[1]!.raw, { response: "granted" });
    await submitConsent(prisma, recipients[2]!.raw, { response: "declined" });
    // recipients[3] does not respond.

    const { totals } = await getEventDashboard(prisma, adminCtx, eventId);
    expect(totals.invited).toBe(4);
    expect(totals.consented).toBe(2);
    expect(totals.declined).toBe(1);
    expect(totals.outstanding).toBe(1);
    expect(totals.consented + totals.declined + totals.outstanding).toBe(totals.invited);
  });

  it("counts a corrected response once (current only)", async () => {
    const { adminCtx, school, eventId, recipients } = await publishedEventWithRecipients(1);
    await prisma.school.update({
      where: { id: school.id },
      data: { settings: JSON.stringify({ allowConsentEditing: true }) },
    });
    await submitConsent(prisma, recipients[0]!.raw, { response: "granted" });
    await submitConsent(prisma, recipients[0]!.raw, { response: "declined" });

    const { totals } = await getEventDashboard(prisma, adminCtx, eventId);
    expect(totals.invited).toBe(1);
    expect(totals.consented).toBe(0);
    expect(totals.declined).toBe(1);
  });
});

describe("response filtering", () => {
  beforeEach(resetDb);

  it("filters by status", async () => {
    const { adminCtx, eventId, recipients } = await publishedEventWithRecipients(3);
    await submitConsent(prisma, recipients[0]!.raw, { response: "granted" });
    await submitConsent(prisma, recipients[1]!.raw, { response: "declined" });

    expect(await getEventResponses(prisma, adminCtx, eventId, "all")).toHaveLength(3);
    expect(await getEventResponses(prisma, adminCtx, eventId, "consented")).toHaveLength(1);
    expect(await getEventResponses(prisma, adminCtx, eventId, "declined")).toHaveLength(1);
    expect(await getEventResponses(prisma, adminCtx, eventId, "outstanding")).toHaveLength(1);
  });
});

describe("consent register export", () => {
  beforeEach(resetDb);

  it("exports a CSV with a header and one row per recipient", async () => {
    const { adminCtx, eventId, recipients } = await publishedEventWithRecipients(2);
    await submitConsent(prisma, recipients[0]!.raw, { response: "granted" });

    const result = await exportConsentRegister(prisma, adminCtx, eventId);
    expect(result.rowCount).toBe(2);
    expect(result.filename).toContain(eventId);

    const grid = parseCsv(result.csv);
    expect(grid[0]).toEqual([
      "pupil_last_name",
      "pupil_first_name",
      "class_name",
      "guardian_name",
      "guardian_email",
      "status",
      "responded_at",
    ]);
    expect(grid).toHaveLength(3); // header + 2 rows
    const statuses = grid.slice(1).map((r) => r[5]);
    expect(statuses).toContain("consented");
    expect(statuses).toContain("outstanding");
  });

  it("records an audit entry with counts only (no personal data)", async () => {
    const { adminCtx, school, eventId } = await publishedEventWithRecipients(1);
    await exportConsentRegister(prisma, adminCtx, eventId);
    const entry = await prisma.auditLog.findFirst({
      where: { schoolId: school.id, action: "register.exported" },
    });
    expect(entry).not.toBeNull();
    expect(entry!.metadata).not.toMatch(/@example\.test/);
    expect(JSON.parse(entry!.metadata).rowCount).toBe(1);
  });
});

describe("dashboard RBAC and tenant isolation", () => {
  beforeEach(resetDb);

  it("cannot view or export an event from another school", async () => {
    const a = await publishedEventWithRecipients(1);
    const b = await createSchoolWithAdmin("School B");

    await expect(getEventDashboard(prisma, b.adminCtx, a.eventId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(exportConsentRegister(prisma, b.adminCtx, a.eventId)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("organiser (event.view) can see the dashboard", async () => {
    const { school, eventId } = await publishedEventWithRecipients(1);
    // A real organiser is not needed here since dashboard reads don't write FKs.
    const organiserCtx = ctxFor(school.id, "org-view", "organiser");
    const { totals } = await getEventDashboard(prisma, organiserCtx, eventId);
    expect(totals.invited).toBe(1);
  });
});
