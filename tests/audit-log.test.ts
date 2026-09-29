import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { ForbiddenError } from "@/server/errors";
import { getAuditActionOptions, getAuditLog } from "@/server/services/auditService";
import {
  inviteStaff,
  activateWithPassword,
  deleteStaff,
} from "@/server/services/staffAdminService";
import { createSchoolWithAdmin, ctxFor, resetDb, TEST_PASSWORD } from "./helpers";

// Audit log viewer (Requirement 8 of the MVP admin & consent enhancements
// spec) — admin-only, tenant-scoped, filterable, paginated.

describe("getAuditLog: capability", () => {
  beforeEach(resetDb);

  it("organiser cannot view the audit log (audit.view is admin-only)", async () => {
    const { school } = await createSchoolWithAdmin();
    const organiserCtx = ctxFor(school.id, "org-1", "organiser");

    await expect(getAuditLog(prisma, organiserCtx, {})).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("admin can view the audit log", async () => {
    const { adminCtx } = await createSchoolWithAdmin();
    await expect(getAuditLog(prisma, adminCtx, {})).resolves.toBeTruthy();
  });
});

describe("getAuditLog: tenant isolation", () => {
  beforeEach(resetDb);

  it("only returns entries for the actor's own school", async () => {
    const a = await createSchoolWithAdmin("School A");
    const b = await createSchoolWithAdmin("School B");
    // Each createSchoolWithAdmin invite+activate flow writes its own
    // staff.invited/staff.activated audit rows already, scoped per school.

    const resultA = await getAuditLog(prisma, a.adminCtx, {});
    const resultB = await getAuditLog(prisma, b.adminCtx, {});

    // AuditLogEntry doesn't carry schoolId, so cross-check counts against a
    // raw query scoped to each school directly: neither result should leak
    // rows from the other tenant.
    const rawA = await prisma.auditLog.findMany({ where: { schoolId: a.school.id } });
    const rawB = await prisma.auditLog.findMany({ where: { schoolId: b.school.id } });
    expect(resultA.total).toEqual(rawA.length);
    expect(resultB.total).toEqual(rawB.length);
  });
});

describe("getAuditLog: filters", () => {
  beforeEach(resetDb);

  it("filters by actorId", async () => {
    const { adminCtx, school, admin } = await createSchoolWithAdmin();
    const staff = await inviteStaff(prisma, adminCtx, {
      name: "Jamie",
      email: "jamie@example.test",
      role: "organiser",
    });
    await activateWithPassword(prisma, school.id, staff.id, { password: TEST_PASSWORD });

    // Every audit row from setup was actorId=admin.id (createSchoolWithAdmin's
    // bootstrap invite is actorId="bootstrap", but inviteStaff above IS
    // actorId=admin.id via adminCtx).
    const filtered = await getAuditLog(prisma, adminCtx, { actorId: admin.id });
    expect(filtered.rows.length).toBeGreaterThan(0);
    expect(filtered.rows.every((r) => r.actorId === admin.id)).toBe(true);
  });

  it("filters by action", async () => {
    const { adminCtx, school } = await createSchoolWithAdmin();
    const staff = await inviteStaff(prisma, adminCtx, {
      name: "Jamie",
      email: "jamie2@example.test",
      role: "organiser",
    });
    await activateWithPassword(prisma, school.id, staff.id, { password: TEST_PASSWORD });
    await deleteStaff(prisma, adminCtx, staff.id);

    const filtered = await getAuditLog(prisma, adminCtx, { action: "staff.deleted" });
    expect(filtered.rows).toHaveLength(1);
    expect(filtered.rows[0]?.action).toEqual("staff.deleted");
    expect(filtered.rows[0]?.entityId).toEqual(staff.id);
  });

  it("filters by date range (from/to)", async () => {
    const { adminCtx, school } = await createSchoolWithAdmin();
    const staff = await inviteStaff(prisma, adminCtx, {
      name: "Jamie",
      email: "jamie3@example.test",
      role: "organiser",
    });
    await activateWithPassword(prisma, school.id, staff.id, { password: TEST_PASSWORD });

    // A window that excludes everything (the future) returns nothing.
    const future = await getAuditLog(prisma, adminCtx, { from: new Date(Date.now() + 60_000) });
    expect(future.rows).toHaveLength(0);

    // A window from the past to now includes everything so far.
    const past = await getAuditLog(prisma, adminCtx, { from: new Date(Date.now() - 60_000) });
    expect(past.rows.length).toBeGreaterThan(0);
  });

  it("filters by entityType and entityId together", async () => {
    const { adminCtx, school } = await createSchoolWithAdmin();
    const staff = await inviteStaff(prisma, adminCtx, {
      name: "Jamie",
      email: "jamie4@example.test",
      role: "organiser",
    });
    await activateWithPassword(prisma, school.id, staff.id, { password: TEST_PASSWORD });

    const filtered = await getAuditLog(prisma, adminCtx, { entityType: "StaffUser", entityId: staff.id });
    expect(filtered.rows.length).toBeGreaterThan(0);
    expect(filtered.rows.every((r) => r.entityType === "StaffUser" && r.entityId === staff.id)).toBe(
      true,
    );
  });
});

describe("getAuditLog: pagination", () => {
  beforeEach(resetDb);

  it("respects page and pageSize, and reports the correct total", async () => {
    const { adminCtx, school } = await createSchoolWithAdmin();
    // Generate several audit rows via distinct invites.
    for (let i = 0; i < 5; i++) {
      const staff = await inviteStaff(prisma, adminCtx, {
        name: `Staff ${i}`,
        email: `staff${i}@example.test`,
        role: "organiser",
      });
      await activateWithPassword(prisma, school.id, staff.id, { password: TEST_PASSWORD });
    }

    const totalResult = await getAuditLog(prisma, adminCtx, {});
    const total = totalResult.total;
    expect(total).toBeGreaterThanOrEqual(10); // 5 invited + 5 activated, at least

    const firstPage = await getAuditLog(prisma, adminCtx, {}, { page: 1, pageSize: 4 });
    expect(firstPage.rows).toHaveLength(4);
    expect(firstPage.total).toEqual(total);

    const secondPage = await getAuditLog(prisma, adminCtx, {}, { page: 2, pageSize: 4 });
    expect(secondPage.rows).toHaveLength(4);
    // No overlap between pages.
    const firstIds = new Set(firstPage.rows.map((r) => r.id));
    expect(secondPage.rows.every((r) => !firstIds.has(r.id))).toBe(true);
  });

  it("clamps an invalid page/pageSize to sane defaults rather than erroring", async () => {
    const { adminCtx } = await createSchoolWithAdmin();
    const result = await getAuditLog(prisma, adminCtx, {}, { page: 0, pageSize: -5 });
    expect(result.page).toBe(1);
    expect(result.pageSize).toBeGreaterThan(0);
  });
});

describe("getAuditLog: actor name resolution", () => {
  beforeEach(resetDb);

  it("resolves actorId to the staff member's current name", async () => {
    const { adminCtx, admin } = await createSchoolWithAdmin();
    const result = await getAuditLog(prisma, adminCtx, { actorId: admin.id });
    expect(result.rows.every((r) => r.actorName === admin.name)).toBe(true);
  });

  it("falls back to '(deleted user)' once the referenced staff row has been hard-deleted", async () => {
    const { adminCtx, school } = await createSchoolWithAdmin();
    const staff = await inviteStaff(prisma, adminCtx, {
      name: "Soon Deleted",
      email: "soon-deleted@example.test",
      role: "organiser",
    });
    await activateWithPassword(prisma, school.id, staff.id, { password: TEST_PASSWORD });

    // A row recording an action THIS staff member performed themselves
    // (actorId = their own id) — analogous to any event.manage action an
    // organiser takes on their own account, e.g. via createEventDraft.
    await prisma.auditLog.create({
      data: {
        schoolId: school.id,
        actorType: "staff",
        actorId: staff.id,
        action: "event.created",
        entityType: "Event",
        entityId: "some-event-id",
        metadata: "{}",
      },
    });

    // activateWithPassword ALSO records a "staff.activated" row with
    // actorId=staff.id (the newly activated account is its own actor for
    // that event), so at least 2 rows reference this staff member by now.
    const before = await getAuditLog(prisma, adminCtx, { actorId: staff.id });
    expect(before.rows.length).toBeGreaterThanOrEqual(2);
    expect(before.rows.every((r) => r.actorName === "Soon Deleted")).toBe(true);

    // Hard-delete them (no events created via createEventDraft, so
    // countEventsCreatedBy is 0 and the delete succeeds outright).
    await deleteStaff(prisma, adminCtx, staff.id);

    const after = await getAuditLog(prisma, adminCtx, { actorId: staff.id });
    expect(after.rows.length).toEqual(before.rows.length);
    expect(after.rows.every((r) => r.actorName === "(deleted user)")).toBe(true);
  });
});

describe("getAuditActionOptions", () => {
  beforeEach(resetDb);

  it("returns distinct action names seen for the school", async () => {
    const { adminCtx, school } = await createSchoolWithAdmin();
    const staff = await inviteStaff(prisma, adminCtx, {
      name: "Jamie",
      email: "jamie5@example.test",
      role: "organiser",
    });
    await activateWithPassword(prisma, school.id, staff.id, { password: TEST_PASSWORD });

    const options = await getAuditActionOptions(prisma, adminCtx);
    expect(options).toContain("staff.invited");
    expect(options).toContain("staff.activated");
    // Distinct: no duplicates.
    expect(new Set(options).size).toEqual(options.length);
  });

  it("organiser cannot list action options either", async () => {
    const { school } = await createSchoolWithAdmin();
    const organiserCtx = ctxFor(school.id, "org-1", "organiser");
    await expect(getAuditActionOptions(prisma, organiserCtx)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
