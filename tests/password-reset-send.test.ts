import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { ForbiddenError, NotFoundError } from "@/server/errors";
import { sendPasswordResetForStaff } from "@/server/services/passwordResetService";
import { inviteStaff, activateWithPassword, deactivateStaff } from "@/server/services/staffAdminService";
import { createSchoolWithAdmin, ctxFor, resetDb, TEST_PASSWORD } from "./helpers";

// Admin-triggered password reset (Requirement 7 of the MVP admin & consent
// enhancements spec, part 2).

async function inviteAndActivate(adminCtx: Awaited<ReturnType<typeof createSchoolWithAdmin>>["adminCtx"], schoolId: string) {
  const staff = await inviteStaff(prisma, adminCtx, {
    name: "Jamie Organiser",
    email: `jamie.${Math.random().toString(36).slice(2)}@example.test`,
    role: "organiser",
  });
  await activateWithPassword(prisma, schoolId, staff.id, { password: TEST_PASSWORD });
  return staff;
}

describe("sendPasswordResetForStaff", () => {
  beforeEach(resetDb);

  it("issues a token and reports sent:true via the (mock) email provider", async () => {
    const { adminCtx, school } = await createSchoolWithAdmin();
    const staff = await inviteAndActivate(adminCtx, school.id);

    const result = await sendPasswordResetForStaff(prisma, adminCtx, staff.id);
    expect(result.sent).toBe(true);

    const tokenCount = await prisma.passwordResetToken.count({ where: { staffUserId: staff.id } });
    expect(tokenCount).toBe(1);
  });

  it("writes a staff.password_reset_sent audit entry", async () => {
    const { adminCtx, school } = await createSchoolWithAdmin();
    const staff = await inviteAndActivate(adminCtx, school.id);

    await sendPasswordResetForStaff(prisma, adminCtx, staff.id);

    const entry = await prisma.auditLog.findFirst({
      where: { schoolId: school.id, action: "staff.password_reset_sent", entityId: staff.id },
    });
    expect(entry).not.toBeNull();
    const meta = JSON.parse(entry!.metadata) as Record<string, unknown>;
    expect(meta.emailSent).toBe(true);
  });

  it("rejects sending for a staff member who is only 'invited', not yet active", async () => {
    const { adminCtx, school } = await createSchoolWithAdmin();
    const invited = await inviteStaff(prisma, adminCtx, {
      name: "Not Yet Active",
      email: "not-yet-active@example.test",
      role: "organiser",
    });
    void school;

    await expect(sendPasswordResetForStaff(prisma, adminCtx, invited.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("rejects sending for a deactivated staff member", async () => {
    const { adminCtx, school } = await createSchoolWithAdmin();
    const staff = await inviteAndActivate(adminCtx, school.id);
    await deactivateStaff(prisma, adminCtx, staff.id);

    await expect(sendPasswordResetForStaff(prisma, adminCtx, staff.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("throws NotFoundError for a staff id in a different school", async () => {
    const a = await createSchoolWithAdmin("School A");
    const b = await createSchoolWithAdmin("School B");
    const staffB = await inviteAndActivate(b.adminCtx, b.school.id);

    await expect(sendPasswordResetForStaff(prisma, a.adminCtx, staffB.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("organiser cannot send a reset link (staff.reset_password is admin-only)", async () => {
    const { adminCtx, school } = await createSchoolWithAdmin();
    const staff = await inviteAndActivate(adminCtx, school.id);
    const organiserCtx = ctxFor(school.id, "org-actor", "organiser");

    await expect(sendPasswordResetForStaff(prisma, organiserCtx, staff.id)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("admin CAN send a reset link to another admin (not just organisers)", async () => {
    const { adminCtx, school } = await createSchoolWithAdmin();
    const otherAdmin = await inviteStaff(prisma, adminCtx, {
      name: "Second Admin",
      email: "second-admin@example.test",
      role: "admin",
    });
    await activateWithPassword(prisma, school.id, otherAdmin.id, { password: TEST_PASSWORD });

    const result = await sendPasswordResetForStaff(prisma, adminCtx, otherAdmin.id);
    expect(result.sent).toBe(true);
  });
});
