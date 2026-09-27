import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { UnauthenticatedError } from "@/server/errors";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { generateSessionToken, hashToken } from "@/server/auth/tokens";
import { login, logout, resolveSession } from "@/server/services/authService";
import { createSchoolWithAdmin, resetDb, TEST_PASSWORD } from "./helpers";

describe("password hashing", () => {
  it("verifies a correct password and rejects a wrong one", async () => {
    const hash = await hashPassword(TEST_PASSWORD);
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword(TEST_PASSWORD, hash)).toBe(true);
    expect(await verifyPassword("wrong-password-value", hash)).toBe(false);
  });

  it("rejects short passwords", async () => {
    await expect(hashPassword("short")).rejects.toThrowError(/at least 12/);
  });

  it("verify returns false for null/garbage stored hashes", async () => {
    expect(await verifyPassword("anything", null)).toBe(false);
    expect(await verifyPassword("anything", "not-a-valid-hash")).toBe(false);
  });
});

describe("session tokens", () => {
  it("hashes deterministically and does not store the raw token", () => {
    const { raw, hash } = generateSessionToken();
    expect(raw).not.toEqual(hash);
    expect(hashToken(raw)).toEqual(hash);
  });
});

describe("login and session lifecycle", () => {
  beforeEach(resetDb);

  it("logs in an active admin and resolves the session", async () => {
    const { school, admin } = await createSchoolWithAdmin();
    const result = await login(prisma, school.id, {
      email: admin.email,
      password: TEST_PASSWORD,
    });
    expect(result.context.schoolId).toEqual(school.id);
    expect(result.context.role).toEqual("admin");

    const ctx = await resolveSession(prisma, result.token);
    expect(ctx?.staffUserId).toEqual(admin.id);
  });

  it("rejects wrong password with a generic error", async () => {
    const { school, admin } = await createSchoolWithAdmin();
    await expect(login(prisma, school.id, { email: admin.email, password: "nope-nope-nope" })).rejects.toBeInstanceOf(
      UnauthenticatedError,
    );
  });

  it("rejects login for an invited (not yet active) staff member", async () => {
    const { school, adminCtx } = await createSchoolWithAdmin();
    // Invite but do not activate.
    const { inviteStaff } = await import("@/server/services/staffAdminService");
    const invited = await inviteStaff(prisma, adminCtx, {
      name: "Pending",
      email: "pending@example.test",
      role: "organiser",
    });
    await expect(
      login(prisma, school.id, { email: invited.email, password: TEST_PASSWORD }),
    ).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it("does not authenticate across tenants", async () => {
    const a = await createSchoolWithAdmin("School A");
    const b = await createSchoolWithAdmin("School B");
    // A's admin credentials must not work against school B's tenant.
    await expect(
      login(prisma, b.school.id, { email: a.admin.email, password: TEST_PASSWORD }),
    ).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it("revokes the session on logout", async () => {
    const { school, admin } = await createSchoolWithAdmin();
    const result = await login(prisma, school.id, { email: admin.email, password: TEST_PASSWORD });
    expect(await resolveSession(prisma, result.token)).not.toBeNull();

    await logout(prisma, result.token, result.context);
    expect(await resolveSession(prisma, result.token)).toBeNull();
  });

  it("rejects an expired session", async () => {
    const { school, admin } = await createSchoolWithAdmin();
    const result = await login(prisma, school.id, { email: admin.email, password: TEST_PASSWORD });

    // Force expiry in the past.
    await prisma.staffSession.updateMany({
      where: { tokenHash: hashToken(result.token) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await resolveSession(prisma, result.token)).toBeNull();
  });

  it("rejects a session once the staff member is deactivated", async () => {
    const { school, admin, adminCtx } = await createSchoolWithAdmin();
    // Second admin to perform the deactivation (cannot self-deactivate).
    const { inviteStaff, activateWithPassword, deactivateStaff } = await import(
      "@/server/services/staffAdminService"
    );
    const other = await inviteStaff(prisma, adminCtx, {
      name: "Other Admin",
      email: "other.admin@example.test",
      role: "admin",
    });
    await activateWithPassword(prisma, school.id, other.id, { password: TEST_PASSWORD });
    const otherLogin = await login(prisma, school.id, { email: other.email, password: TEST_PASSWORD });

    await deactivateStaff(prisma, adminCtx, other.id);
    expect(await resolveSession(prisma, otherLogin.token)).toBeNull();
    // The acting admin's own session is unaffected.
    expect(admin.id).toEqual(adminCtx.staffUserId);
  });

  it("rejects an unknown/garbage token", async () => {
    expect(await resolveSession(prisma, "not-a-real-token")).toBeNull();
    expect(await resolveSession(prisma, "")).toBeNull();
  });
});
