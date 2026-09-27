import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { UnauthenticatedError } from "@/server/errors";
import { loginByEmail } from "@/server/services/authService";
import { createSchoolWithAdmin, resetDb, TEST_PASSWORD } from "./helpers";

// loginByEmail resolves the tenant from the email before delegating to the
// existing, already-tested login(). These tests cover the resolution step
// itself (unique match / no match / ambiguous match), which is the only new
// behaviour — session issuance, expiry, etc. are covered by
// tests/auth-session.test.ts.

describe("loginByEmail: tenant resolution", () => {
  beforeEach(resetDb);

  it("logs in when the email is active in exactly one school", async () => {
    const { admin } = await createSchoolWithAdmin();
    const result = await loginByEmail(prisma, { email: admin.email, password: TEST_PASSWORD });
    expect(result.context.staffUserId).toEqual(admin.id);
  });

  it("rejects an email that matches no school (generic error)", async () => {
    await expect(
      loginByEmail(prisma, { email: "nobody@example.test", password: "whatever-not-checked" }),
    ).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it("rejects with the same generic error when the email exists in two schools", async () => {
    const a = await createSchoolWithAdmin("School A");
    const b = await createSchoolWithAdmin("School B");
    const shared = "shared.staff@example.test";
    const { inviteStaff, activateWithPassword } = await import("@/server/services/staffAdminService");

    const inA = await inviteStaff(prisma, a.adminCtx, { name: "S", email: shared, role: "organiser" });
    await activateWithPassword(prisma, a.school.id, inA.id, { password: TEST_PASSWORD });
    const inB = await inviteStaff(prisma, b.adminCtx, { name: "S", email: shared, role: "organiser" });
    await activateWithPassword(prisma, b.school.id, inB.id, { password: TEST_PASSWORD });

    await expect(loginByEmail(prisma, { email: shared, password: TEST_PASSWORD })).rejects.toBeInstanceOf(
      UnauthenticatedError,
    );
  });

  it("ignores a deactivated staff member's email even if unique", async () => {
    const { school, admin, adminCtx } = await createSchoolWithAdmin();
    const { inviteStaff, activateWithPassword, deactivateStaff } = await import(
      "@/server/services/staffAdminService"
    );
    const other = await inviteStaff(prisma, adminCtx, {
      name: "Other",
      email: "other@example.test",
      role: "organiser",
    });
    await activateWithPassword(prisma, school.id, other.id, { password: TEST_PASSWORD });
    await deactivateStaff(prisma, adminCtx, other.id);

    await expect(
      loginByEmail(prisma, { email: other.email, password: TEST_PASSWORD }),
    ).rejects.toBeInstanceOf(UnauthenticatedError);
    expect(admin.id).toEqual(adminCtx.staffUserId);
  });
});
