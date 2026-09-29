import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { deleteStaff, deactivateStaff, inviteStaff, activateWithPassword } from "@/server/services/staffAdminService";
import { createEventDraft } from "@/server/services/eventService";
import { createSchoolWithAdmin, ctxFor, futureEventDates, resetDb, TEST_PASSWORD } from "./helpers";

// Hard-delete staff (Requirement 5 of the MVP admin & consent enhancements
// spec) — distinct from deactivateStaff. Rules: cannot delete self; a
// deactivated account can never be deleted; an account that has created any
// events is force-deactivated instead of deleted.

async function inviteAndActivate(adminCtx: Awaited<ReturnType<typeof createSchoolWithAdmin>>["adminCtx"], schoolId: string) {
  const staff = await inviteStaff(prisma, adminCtx, {
    name: "Jamie Organiser",
    email: `jamie.${Math.random().toString(36).slice(2)}@example.test`,
    role: "organiser",
  });
  await activateWithPassword(prisma, schoolId, staff.id, { password: TEST_PASSWORD });
  return staff;
}

describe("deleteStaff: happy path", () => {
  beforeEach(resetDb);

  it("hard-deletes a staff user who has never created an event", async () => {
    const { adminCtx, school } = await createSchoolWithAdmin();
    const staff = await inviteAndActivate(adminCtx, school.id);

    await deleteStaff(prisma, adminCtx, staff.id);

    const found = await prisma.staffUser.findUnique({ where: { id: staff.id } });
    expect(found).toBeNull();
  });

  it("cascades away the deleted user's sessions and invite tokens", async () => {
    const { adminCtx, school } = await createSchoolWithAdmin();
    const staff = await inviteAndActivate(adminCtx, school.id);

    // Issue a real invite token row for this staff member (activateWithPassword,
    // used by the test helper above, is the internal test/seed bootstrap path
    // and does NOT go through InviteToken — issue one directly to set up the
    // cascade check).
    const { issueInviteToken } = await import("@/server/services/inviteTokenService");
    await issueInviteToken(prisma, school.id, staff.id);
    expect(await prisma.inviteToken.count({ where: { staffUserId: staff.id } })).toBeGreaterThan(0);

    // And a real session row via login.
    const { login } = await import("@/server/services/authService");
    await login(prisma, school.id, { email: staff.email, password: TEST_PASSWORD });
    expect(await prisma.staffSession.count({ where: { staffUserId: staff.id } })).toBeGreaterThan(0);

    await deleteStaff(prisma, adminCtx, staff.id);

    expect(await prisma.inviteToken.count({ where: { staffUserId: staff.id } })).toBe(0);
    expect(await prisma.staffSession.count({ where: { staffUserId: staff.id } })).toBe(0);
  });

  it("writes a staff.deleted audit entry capturing identifying details before the row is gone", async () => {
    const { adminCtx, school } = await createSchoolWithAdmin();
    const staff = await inviteAndActivate(adminCtx, school.id);

    await deleteStaff(prisma, adminCtx, staff.id);

    const entry = await prisma.auditLog.findFirst({
      where: { schoolId: school.id, action: "staff.deleted", entityId: staff.id },
    });
    expect(entry).not.toBeNull();
    const meta = JSON.parse(entry!.metadata) as Record<string, unknown>;
    expect(meta.deletedName).toEqual(staff.name);
    expect(meta.deletedEmail).toEqual(staff.email);
    expect(meta.deletedRole).toEqual("organiser");
  });
});

describe("deleteStaff: has created events", () => {
  beforeEach(resetDb);

  it("force-deactivates instead of deleting, and throws ConflictError explaining why", async () => {
    const { adminCtx, school } = await createSchoolWithAdmin();
    const staff = await inviteAndActivate(adminCtx, school.id);
    const staffCtx = ctxFor(school.id, staff.id, "organiser");
    await createEventDraft(prisma, staffCtx, { title: "Trip", ...futureEventDates() });

    await expect(deleteStaff(prisma, adminCtx, staff.id)).rejects.toBeInstanceOf(ConflictError);

    // The row still exists, but is now deactivated rather than deleted.
    const found = await prisma.staffUser.findUnique({ where: { id: staff.id } });
    expect(found).not.toBeNull();
    expect(found!.status).toEqual("deactivated");
  });

  it("reports the correct event count in the ConflictError message", async () => {
    const { adminCtx, school } = await createSchoolWithAdmin();
    const staff = await inviteAndActivate(adminCtx, school.id);
    const staffCtx = ctxFor(school.id, staff.id, "organiser");
    await createEventDraft(prisma, staffCtx, { title: "Trip One", ...futureEventDates() });
    await createEventDraft(prisma, staffCtx, { title: "Trip Two", ...futureEventDates(45) });

    await expect(deleteStaff(prisma, adminCtx, staff.id)).rejects.toThrowError(/created 2 event/i);
  });

  it("a second delete attempt after the force-deactivation is rejected as 'already deactivated', not re-run as a conflict", async () => {
    const { adminCtx, school } = await createSchoolWithAdmin();
    const staff = await inviteAndActivate(adminCtx, school.id);
    const staffCtx = ctxFor(school.id, staff.id, "organiser");
    await createEventDraft(prisma, staffCtx, { title: "Trip", ...futureEventDates() });

    await expect(deleteStaff(prisma, adminCtx, staff.id)).rejects.toBeInstanceOf(ConflictError);
    // Now that the account is deactivated (as a side effect of the first
    // attempt), a second delete attempt hits the deactivated-account guard
    // instead — it never gets far enough to re-check the event count.
    await expect(deleteStaff(prisma, adminCtx, staff.id)).rejects.toBeInstanceOf(ValidationError);
  });

  it("writes a staff.deactivated audit entry noting the delete-blocked reason", async () => {
    const { adminCtx, school } = await createSchoolWithAdmin();
    const staff = await inviteAndActivate(adminCtx, school.id);
    const staffCtx = ctxFor(school.id, staff.id, "organiser");
    await createEventDraft(prisma, staffCtx, { title: "Trip", ...futureEventDates() });

    await expect(deleteStaff(prisma, adminCtx, staff.id)).rejects.toBeInstanceOf(ConflictError);

    const entry = await prisma.auditLog.findFirst({
      where: { schoolId: school.id, action: "staff.deactivated", entityId: staff.id },
    });
    expect(entry).not.toBeNull();
    const meta = JSON.parse(entry!.metadata) as Record<string, unknown>;
    expect(meta.reason).toEqual("delete_requested_but_has_events");
    expect(meta.eventCount).toEqual(1);
  });
});

describe("deleteStaff: guards", () => {
  beforeEach(resetDb);

  it("a deactivated account can never be deleted", async () => {
    const { adminCtx, school } = await createSchoolWithAdmin();
    const staff = await inviteAndActivate(adminCtx, school.id);
    await deactivateStaff(prisma, adminCtx, staff.id);

    await expect(deleteStaff(prisma, adminCtx, staff.id)).rejects.toBeInstanceOf(ValidationError);
    await expect(deleteStaff(prisma, adminCtx, staff.id)).rejects.toThrowError(/cannot be deleted/i);

    // Confirm it's still there (rejected, not silently no-op'd away).
    const found = await prisma.staffUser.findUnique({ where: { id: staff.id } });
    expect(found).not.toBeNull();
  });

  it("an admin cannot delete their own account", async () => {
    const { adminCtx } = await createSchoolWithAdmin();
    await expect(deleteStaff(prisma, adminCtx, adminCtx.staffUserId)).rejects.toBeInstanceOf(ValidationError);
    await expect(deleteStaff(prisma, adminCtx, adminCtx.staffUserId)).rejects.toThrowError(/own account/i);
  });

  it("throws NotFoundError for a staff id in a different school", async () => {
    const a = await createSchoolWithAdmin("School A");
    const b = await createSchoolWithAdmin("School B");
    const staffB = await inviteAndActivate(b.adminCtx, b.school.id);

    await expect(deleteStaff(prisma, a.adminCtx, staffB.id)).rejects.toBeInstanceOf(NotFoundError);
    // And B's staff member is untouched.
    const found = await prisma.staffUser.findUnique({ where: { id: staffB.id } });
    expect(found).not.toBeNull();
  });

  it("organiser cannot delete staff (staff.delete is admin-only)", async () => {
    const { adminCtx, school } = await createSchoolWithAdmin();
    const staff = await inviteAndActivate(adminCtx, school.id);
    const organiserCtx = ctxFor(school.id, "org-actor", "organiser");

    await expect(deleteStaff(prisma, organiserCtx, staff.id)).rejects.toBeInstanceOf(ForbiddenError);
    // Untouched.
    const found = await prisma.staffUser.findUnique({ where: { id: staff.id } });
    expect(found).not.toBeNull();
  });

  it("throws NotFoundError for an unknown staff id", async () => {
    const { adminCtx } = await createSchoolWithAdmin();
    await expect(deleteStaff(prisma, adminCtx, "not-a-real-id")).rejects.toBeInstanceOf(NotFoundError);
  });
});
