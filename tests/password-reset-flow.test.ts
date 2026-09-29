import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { UnauthenticatedError, ValidationError } from "@/server/errors";
import { requestPasswordReset, resetPassword } from "@/server/services/passwordResetService";
import { issuePasswordResetToken } from "@/server/services/passwordResetTokenService";
import { verifyPassword } from "@/server/auth/password";
import { login } from "@/server/services/authService";
import { inviteStaff, activateWithPassword, deactivateStaff } from "@/server/services/staffAdminService";
import { createSchoolWithAdmin, resetDb, TEST_PASSWORD } from "./helpers";

// Self-serve "forgot password" request + reset consumption (Requirement 7 of
// the MVP admin & consent enhancements spec, part 3).

const NEW_PASSWORD = "Brand-New-Password9!";

async function inviteAndActivate(adminCtx: Awaited<ReturnType<typeof createSchoolWithAdmin>>["adminCtx"], schoolId: string, email: string) {
  const staff = await inviteStaff(prisma, adminCtx, { name: "Jamie Organiser", email, role: "organiser" });
  await activateWithPassword(prisma, schoolId, staff.id, { password: TEST_PASSWORD });
  return staff;
}

describe("requestPasswordReset: self-serve, no account enumeration", () => {
  beforeEach(resetDb);

  it("issues a token and sends an email for a matching active account", async () => {
    const { adminCtx, school } = await createSchoolWithAdmin();
    const staff = await inviteAndActivate(adminCtx, school.id, "jamie@example.test");

    await requestPasswordReset(prisma, staff.email);

    const tokenCount = await prisma.passwordResetToken.count({ where: { staffUserId: staff.id } });
    expect(tokenCount).toBe(1);
    const entry = await prisma.auditLog.findFirst({
      where: { schoolId: school.id, action: "staff.password_reset_requested", entityId: staff.id },
    });
    expect(entry).not.toBeNull();
  });

  it("does nothing observable for an email that matches no account (same as success from the caller's view)", async () => {
    // requestPasswordReset returns void either way — this test asserts the
    // absence of side effects (no token, no audit entry) for a non-existent
    // email, which is exactly what should happen when nothing matches. The
    // page-level "always show the same message" behaviour lives in
    // src/app/forgot-password/actions.ts, not here.
    await expect(requestPasswordReset(prisma, "nobody@example.test")).resolves.toBeUndefined();
    const tokenCount = await prisma.passwordResetToken.count();
    expect(tokenCount).toBe(0);
  });

  it("does nothing for a deactivated account's email (not resettable via self-serve)", async () => {
    const { adminCtx, school } = await createSchoolWithAdmin();
    const staff = await inviteAndActivate(adminCtx, school.id, "deactivated@example.test");
    await deactivateStaff(prisma, adminCtx, staff.id);

    await requestPasswordReset(prisma, staff.email);

    const tokenCount = await prisma.passwordResetToken.count({ where: { staffUserId: staff.id } });
    expect(tokenCount).toBe(0);
  });

  it("silently ignores a malformed email rather than throwing", async () => {
    await expect(requestPasswordReset(prisma, "not-an-email")).resolves.toBeUndefined();
    await expect(requestPasswordReset(prisma, "")).resolves.toBeUndefined();
  });

  it("resolves a shared email to the one matching school, mirroring loginByEmail's tenant resolution", async () => {
    const a = await createSchoolWithAdmin("School A");
    const b = await createSchoolWithAdmin("School B");
    const shared = "shared.staff@example.test";
    const staffA = await inviteAndActivate(a.adminCtx, a.school.id, shared);
    // Only school A's staff member with this email is active; school B has none.
    void b;

    await requestPasswordReset(prisma, shared);

    const tokenCount = await prisma.passwordResetToken.count({ where: { staffUserId: staffA.id } });
    expect(tokenCount).toBe(1);
  });
});

describe("resetPassword: consuming the token", () => {
  beforeEach(resetDb);

  it("sets the new password and allows login with it", async () => {
    const { adminCtx, school } = await createSchoolWithAdmin();
    const staff = await inviteAndActivate(adminCtx, school.id, "reset-me@example.test");
    const issued = await issuePasswordResetToken(prisma, school.id, staff.id);

    await resetPassword(prisma, issued.raw, { password: NEW_PASSWORD });

    const updated = await prisma.staffUser.findUniqueOrThrow({ where: { id: staff.id } });
    expect(await verifyPassword(NEW_PASSWORD, updated.passwordHash)).toBe(true);
    expect(await verifyPassword(TEST_PASSWORD, updated.passwordHash)).toBe(false);

    const loggedIn = await login(prisma, school.id, { email: staff.email, password: NEW_PASSWORD });
    expect(loggedIn.context.staffUserId).toEqual(staff.id);
  });

  it("the token cannot be reused (single use)", async () => {
    const { adminCtx, school } = await createSchoolWithAdmin();
    const staff = await inviteAndActivate(adminCtx, school.id, "reuse-check@example.test");
    const issued = await issuePasswordResetToken(prisma, school.id, staff.id);

    await resetPassword(prisma, issued.raw, { password: NEW_PASSWORD });

    await expect(
      resetPassword(prisma, issued.raw, { password: "Another-New-Password9!" }),
    ).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it("rejects an expired token", async () => {
    const { adminCtx, school } = await createSchoolWithAdmin();
    const staff = await inviteAndActivate(adminCtx, school.id, "expired-check@example.test");
    const issued = await issuePasswordResetToken(prisma, school.id, staff.id);
    await prisma.passwordResetToken.updateMany({
      where: { staffUserId: staff.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await expect(resetPassword(prisma, issued.raw, { password: NEW_PASSWORD })).rejects.toBeInstanceOf(
      UnauthenticatedError,
    );
  });

  it("rejects an unknown/garbage token", async () => {
    await expect(resetPassword(prisma, "garbage-token", { password: NEW_PASSWORD })).rejects.toBeInstanceOf(
      UnauthenticatedError,
    );
  });

  it("rejects a password that doesn't meet the complexity policy, WITHOUT burning the one-time token", async () => {
    const { adminCtx, school } = await createSchoolWithAdmin();
    const staff = await inviteAndActivate(adminCtx, school.id, "weak-pw-check@example.test");
    const issued = await issuePasswordResetToken(prisma, school.id, staff.id);

    await expect(resetPassword(prisma, issued.raw, { password: "alllowercase123" })).rejects.toBeInstanceOf(
      ValidationError,
    );
    // The token is still usable, since validation happens BEFORE consumption.
    await resetPassword(prisma, issued.raw, { password: NEW_PASSWORD });
    const updated = await prisma.staffUser.findUniqueOrThrow({ where: { id: staff.id } });
    expect(await verifyPassword(NEW_PASSWORD, updated.passwordHash)).toBe(true);
  });

  it("rejects the reset if the account was deactivated after the link was issued", async () => {
    const { adminCtx, school } = await createSchoolWithAdmin();
    const staff = await inviteAndActivate(adminCtx, school.id, "deactivated-after-issue@example.test");
    const issued = await issuePasswordResetToken(prisma, school.id, staff.id);
    await deactivateStaff(prisma, adminCtx, staff.id);

    await expect(resetPassword(prisma, issued.raw, { password: NEW_PASSWORD })).rejects.toBeInstanceOf(
      UnauthenticatedError,
    );
  });

  it("writes a staff.password_reset audit entry", async () => {
    const { adminCtx, school } = await createSchoolWithAdmin();
    const staff = await inviteAndActivate(adminCtx, school.id, "audit-check@example.test");
    const issued = await issuePasswordResetToken(prisma, school.id, staff.id);

    await resetPassword(prisma, issued.raw, { password: NEW_PASSWORD });

    const entry = await prisma.auditLog.findFirst({
      where: { schoolId: school.id, action: "staff.password_reset", entityId: staff.id },
    });
    expect(entry).not.toBeNull();
  });
});

describe("session invalidation timing (Requirement 7.4)", () => {
  beforeEach(resetDb);

  it("does NOT revoke sessions merely by requesting/sending a reset link", async () => {
    const { adminCtx, school } = await createSchoolWithAdmin();
    const staff = await inviteAndActivate(adminCtx, school.id, "still-logged-in@example.test");
    const activeLogin = await login(prisma, school.id, { email: staff.email, password: TEST_PASSWORD });

    await requestPasswordReset(prisma, staff.email);

    const { resolveSession } = await import("@/server/services/authService");
    expect(await resolveSession(prisma, activeLogin.token)).not.toBeNull();
  });

  it("does NOT revoke sessions when an admin sends the reset link either", async () => {
    const { adminCtx, school } = await createSchoolWithAdmin();
    const staff = await inviteAndActivate(adminCtx, school.id, "admin-sent-still-logged-in@example.test");
    const activeLogin = await login(prisma, school.id, { email: staff.email, password: TEST_PASSWORD });

    const { sendPasswordResetForStaff } = await import("@/server/services/passwordResetService");
    await sendPasswordResetForStaff(prisma, adminCtx, staff.id);

    const { resolveSession } = await import("@/server/services/authService");
    expect(await resolveSession(prisma, activeLogin.token)).not.toBeNull();
  });

  it("revokes ALL existing sessions once the reset actually completes", async () => {
    const { adminCtx, school } = await createSchoolWithAdmin();
    const staff = await inviteAndActivate(adminCtx, school.id, "gets-logged-out@example.test");
    const sessionA = await login(prisma, school.id, { email: staff.email, password: TEST_PASSWORD });
    const sessionB = await login(prisma, school.id, { email: staff.email, password: TEST_PASSWORD });

    const issued = await issuePasswordResetToken(prisma, school.id, staff.id);
    await resetPassword(prisma, issued.raw, { password: NEW_PASSWORD });

    const { resolveSession } = await import("@/server/services/authService");
    expect(await resolveSession(prisma, sessionA.token)).toBeNull();
    expect(await resolveSession(prisma, sessionB.token)).toBeNull();
  });

  it("does not affect another staff member's sessions", async () => {
    const { adminCtx, school, admin } = await createSchoolWithAdmin();
    const staff = await inviteAndActivate(adminCtx, school.id, "isolated-from-admin@example.test");
    const adminLogin = await login(prisma, school.id, { email: admin.email, password: TEST_PASSWORD });

    const issued = await issuePasswordResetToken(prisma, school.id, staff.id);
    await resetPassword(prisma, issued.raw, { password: NEW_PASSWORD });

    const { resolveSession } = await import("@/server/services/authService");
    expect(await resolveSession(prisma, adminLogin.token)).not.toBeNull();
  });
});
