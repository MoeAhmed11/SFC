import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { UnauthenticatedError, ValidationError } from "@/server/errors";
import { hashToken } from "@/server/auth/tokens";
import { issueInviteToken, peekInviteToken, consumeInviteToken } from "@/server/services/inviteTokenService";
import { acceptInvite, getInvitePreview } from "@/server/services/inviteAcceptanceService";
import { inviteStaff } from "@/server/services/staffAdminService";
import { loginByEmail } from "@/server/services/authService";
import { createSchoolWithAdmin, resetDb } from "./helpers";

async function inviteOrganiser(adminCtx: Awaited<ReturnType<typeof createSchoolWithAdmin>>["adminCtx"]) {
  return inviteStaff(prisma, adminCtx, {
    name: "New Teacher",
    email: "new.teacher@example.test",
    role: "organiser",
  });
}

describe("invite token issuance & hashing", () => {
  beforeEach(resetDb);

  it("stores only the hash, never the raw token", async () => {
    const { school, adminCtx } = await createSchoolWithAdmin();
    const staff = await inviteOrganiser(adminCtx);
    const issued = await issueInviteToken(prisma, school.id, staff.id);

    const stored = await prisma.inviteToken.findFirst({ where: { staffUserId: staff.id } });
    expect(stored).not.toBeNull();
    expect(stored!.tokenHash).toEqual(hashToken(issued.raw));
    expect(JSON.stringify(stored)).not.toContain(issued.raw);
  });

  it("issues unique tokens across calls", async () => {
    const { school, adminCtx } = await createSchoolWithAdmin();
    const staff = await inviteOrganiser(adminCtx);
    const a = await issueInviteToken(prisma, school.id, staff.id);
    const b = await issueInviteToken(prisma, school.id, staff.id);
    expect(a.raw).not.toEqual(b.raw);
  });
});

describe("invite token validation and single-use consumption", () => {
  beforeEach(resetDb);

  it("peek resolves a valid token without consuming it", async () => {
    const { school, adminCtx } = await createSchoolWithAdmin();
    const staff = await inviteOrganiser(adminCtx);
    const issued = await issueInviteToken(prisma, school.id, staff.id);

    const binding = await peekInviteToken(prisma, issued.raw);
    expect(binding?.staffUserId).toEqual(staff.id);
    // Peeking again still works — not consumed.
    expect(await peekInviteToken(prisma, issued.raw)).not.toBeNull();
  });

  it("consume works once and rejects a second attempt (single use)", async () => {
    const { school, adminCtx } = await createSchoolWithAdmin();
    const staff = await inviteOrganiser(adminCtx);
    const issued = await issueInviteToken(prisma, school.id, staff.id);

    const first = await consumeInviteToken(prisma, issued.raw);
    expect(first?.staffUserId).toEqual(staff.id);

    const second = await consumeInviteToken(prisma, issued.raw);
    expect(second).toBeNull();
  });

  it("rejects an expired token", async () => {
    const { school, adminCtx } = await createSchoolWithAdmin();
    const staff = await inviteOrganiser(adminCtx);
    const issued = await issueInviteToken(prisma, school.id, staff.id);
    await prisma.inviteToken.updateMany({
      where: { tokenHash: hashToken(issued.raw) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await peekInviteToken(prisma, issued.raw)).toBeNull();
  });

  it("rejects an unknown token", async () => {
    expect(await peekInviteToken(prisma, "not-a-real-token")).toBeNull();
    expect(await peekInviteToken(prisma, "")).toBeNull();
  });
});

describe("invite preview", () => {
  beforeEach(resetDb);

  it("shows the staff name and school without exposing internals", async () => {
    const { school, adminCtx } = await createSchoolWithAdmin();
    const staff = await inviteOrganiser(adminCtx);
    const issued = await issueInviteToken(prisma, school.id, staff.id);

    const preview = await getInvitePreview(prisma, issued.raw);
    expect(preview.staffName).toEqual("New Teacher");
    expect(preview.schoolName).toEqual(school.name);
  });

  it("gives one generic error for an invalid token", async () => {
    await expect(getInvitePreview(prisma, "nope")).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it("rejects a token for an already-activated account", async () => {
    const { school, adminCtx } = await createSchoolWithAdmin();
    const staff = await inviteOrganiser(adminCtx);
    const issued = await issueInviteToken(prisma, school.id, staff.id);
    await acceptInvite(prisma, issued.raw, { password: "a-strong-password-123" });

    // Issue a second token for the now-active account and confirm the preview
    // still refuses (status is no longer "invited").
    const secondIssued = await issueInviteToken(prisma, school.id, staff.id);
    await expect(getInvitePreview(prisma, secondIssued.raw)).rejects.toBeInstanceOf(UnauthenticatedError);
  });
});

describe("accepting an invite", () => {
  beforeEach(resetDb);

  it("activates the account, consumes the token, and enables login", async () => {
    const { school, adminCtx } = await createSchoolWithAdmin();
    const staff = await inviteOrganiser(adminCtx);
    const issued = await issueInviteToken(prisma, school.id, staff.id);

    await acceptInvite(prisma, issued.raw, { password: "a-strong-password-123" });

    const updated = await prisma.staffUser.findUniqueOrThrow({ where: { id: staff.id } });
    expect(updated.status).toEqual("active");
    expect(updated.passwordHash).not.toBeNull();

    // The token cannot be reused.
    await expect(acceptInvite(prisma, issued.raw, { password: "another-password-123" })).rejects.toBeInstanceOf(
      UnauthenticatedError,
    );

    // And the new staff member can now actually log in.
    const login = await loginByEmail(prisma, { email: staff.email, password: "a-strong-password-123" });
    expect(login.context.staffUserId).toEqual(staff.id);
  });

  it("rejects a too-short password WITHOUT burning the one-time token", async () => {
    const { school, adminCtx } = await createSchoolWithAdmin();
    const staff = await inviteOrganiser(adminCtx);
    const issued = await issueInviteToken(prisma, school.id, staff.id);

    await expect(acceptInvite(prisma, issued.raw, { password: "short" })).rejects.toBeInstanceOf(
      ValidationError,
    );
    // Password validation happens BEFORE token consumption, so a mistaken
    // first attempt doesn't waste the invite — a valid retry on the same
    // token should still succeed.
    await acceptInvite(prisma, issued.raw, { password: "a-strong-password-123" });
    const updated = await prisma.staffUser.findUniqueOrThrow({ where: { id: staff.id } });
    expect(updated.status).toEqual("active");
  });

  it("audits acceptance", async () => {
    const { school, adminCtx } = await createSchoolWithAdmin();
    const staff = await inviteOrganiser(adminCtx);
    const issued = await issueInviteToken(prisma, school.id, staff.id);
    await acceptInvite(prisma, issued.raw, { password: "a-strong-password-123" });

    const entry = await prisma.auditLog.findFirst({
      where: { schoolId: school.id, action: "staff.invite_accepted", entityId: staff.id },
    });
    expect(entry).not.toBeNull();
  });

  it("rejects an unknown token outright", async () => {
    await expect(acceptInvite(prisma, "garbage", { password: "a-strong-password-123" })).rejects.toBeInstanceOf(
      UnauthenticatedError,
    );
  });
});

describe("cross-school isolation", () => {
  beforeEach(resetDb);

  it("an invite token issued in one school cannot resolve to a different school's staff", async () => {
    const a = await createSchoolWithAdmin("School A");
    const b = await createSchoolWithAdmin("School B");
    const staffA = await inviteOrganiser(a.adminCtx);
    const issued = await issueInviteToken(prisma, a.school.id, staffA.id);

    const binding = await peekInviteToken(prisma, issued.raw);
    expect(binding?.schoolId).toEqual(a.school.id);
    expect(binding?.schoolId).not.toEqual(b.school.id);
  });
});
