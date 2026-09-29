import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { hashToken } from "@/server/auth/tokens";
import {
  issuePasswordResetToken,
  peekPasswordResetToken,
  consumePasswordResetToken,
} from "@/server/services/passwordResetTokenService";
import { login } from "@/server/services/authService";
import { revokeAllSessionsForStaff } from "@/server/repositories/sessionRepository";
import { createSchoolWithAdmin, resetDb, TEST_PASSWORD } from "./helpers";

// Password reset token mechanics (Requirement 7 of the MVP admin & consent
// enhancements spec, part 1: schema + token service). The full admin-sent and
// self-serve flows are covered in later tasks; this exercises the token
// primitives themselves, mirroring tests/invite-acceptance.test.ts's coverage
// of inviteTokenService.

describe("password reset token issuance & hashing", () => {
  beforeEach(resetDb);

  it("stores only the hash, never the raw token", async () => {
    const { school, admin } = await createSchoolWithAdmin();
    const issued = await issuePasswordResetToken(prisma, school.id, admin.id);

    const stored = await prisma.passwordResetToken.findFirst({ where: { staffUserId: admin.id } });
    expect(stored).not.toBeNull();
    expect(stored!.tokenHash).toEqual(hashToken(issued.raw));
    expect(JSON.stringify(stored)).not.toContain(issued.raw);
  });

  it("issues unique tokens across calls", async () => {
    const { school, admin } = await createSchoolWithAdmin();
    const a = await issuePasswordResetToken(prisma, school.id, admin.id);
    const b = await issuePasswordResetToken(prisma, school.id, admin.id);
    expect(a.raw).not.toEqual(b.raw);
  });

  it("expires on a short (1 hour) window, unlike the 7-day invite TTL", async () => {
    const { school, admin } = await createSchoolWithAdmin();
    const issued = await issuePasswordResetToken(prisma, school.id, admin.id);
    const minutesUntilExpiry = (issued.expiresAt.getTime() - Date.now()) / (60 * 1000);
    expect(minutesUntilExpiry).toBeGreaterThan(55);
    expect(minutesUntilExpiry).toBeLessThanOrEqual(60);
  });
});

describe("password reset token validation and single-use consumption", () => {
  beforeEach(resetDb);

  it("peek resolves a valid token without consuming it", async () => {
    const { school, admin } = await createSchoolWithAdmin();
    const issued = await issuePasswordResetToken(prisma, school.id, admin.id);

    const binding = await peekPasswordResetToken(prisma, issued.raw);
    expect(binding?.staffUserId).toEqual(admin.id);
    expect(await peekPasswordResetToken(prisma, issued.raw)).not.toBeNull();
  });

  it("consume works once and rejects a second attempt (single use)", async () => {
    const { school, admin } = await createSchoolWithAdmin();
    const issued = await issuePasswordResetToken(prisma, school.id, admin.id);

    const first = await consumePasswordResetToken(prisma, issued.raw);
    expect(first?.staffUserId).toEqual(admin.id);

    const second = await consumePasswordResetToken(prisma, issued.raw);
    expect(second).toBeNull();
  });

  it("rejects an expired token", async () => {
    const { school, admin } = await createSchoolWithAdmin();
    const issued = await issuePasswordResetToken(prisma, school.id, admin.id);
    await prisma.passwordResetToken.updateMany({
      where: { tokenHash: hashToken(issued.raw) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await peekPasswordResetToken(prisma, issued.raw)).toBeNull();
  });

  it("rejects an unknown or missing token", async () => {
    expect(await peekPasswordResetToken(prisma, "not-a-real-token")).toBeNull();
    expect(await peekPasswordResetToken(prisma, "")).toBeNull();
  });
});

describe("revokeAllSessionsForStaff", () => {
  beforeEach(resetDb);

  it("revokes every live session for a staff user", async () => {
    const { school, admin } = await createSchoolWithAdmin();
    const a = await login(prisma, school.id, { email: admin.email, password: TEST_PASSWORD });
    const b = await login(prisma, school.id, { email: admin.email, password: TEST_PASSWORD });

    await revokeAllSessionsForStaff(prisma, admin.id);

    const { resolveSession } = await import("@/server/services/authService");
    expect(await resolveSession(prisma, a.token)).toBeNull();
    expect(await resolveSession(prisma, b.token)).toBeNull();
  });

  it("does not affect another staff user's sessions", async () => {
    const { school, admin, adminCtx } = await createSchoolWithAdmin();
    const { inviteStaff, activateWithPassword } = await import("@/server/services/staffAdminService");
    const other = await inviteStaff(prisma, adminCtx, {
      name: "Other",
      email: "other@example.test",
      role: "organiser",
    });
    await activateWithPassword(prisma, school.id, other.id, { password: TEST_PASSWORD });
    const otherLogin = await login(prisma, school.id, { email: other.email, password: TEST_PASSWORD });
    const adminLogin = await login(prisma, school.id, { email: admin.email, password: TEST_PASSWORD });

    await revokeAllSessionsForStaff(prisma, other.id);

    const { resolveSession } = await import("@/server/services/authService");
    expect(await resolveSession(prisma, otherLogin.token)).toBeNull();
    expect(await resolveSession(prisma, adminLogin.token)).not.toBeNull();
  });
});
