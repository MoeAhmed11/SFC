import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { NotFoundError } from "@/server/errors";
import { hashToken } from "@/server/auth/tokens";
import {
  issueTokenForRecipient,
  reissueLink,
  validateToken,
} from "@/server/services/secureLinkService";
import {
  createSchoolWithAdmin,
  createPupilWithPrimaryGuardian,
  futureEventDates,
  resetDb,
} from "./helpers";
import { createEventDraft } from "@/server/services/eventService";

async function setup() {
  const { adminCtx, school } = await createSchoolWithAdmin();
  const { pupilId, guardianId } = await createPupilWithPrimaryGuardian(adminCtx);
  const event = await createEventDraft(prisma, adminCtx, { title: "Trip", ...futureEventDates() });
  return { adminCtx, school, pupilId, guardianId, eventId: event.id };
}

describe("secure token issuance & hashing", () => {
  beforeEach(resetDb);

  it("stores only the hash, never the raw token", async () => {
    const { school, eventId, pupilId, guardianId } = await setup();
    const issued = await issueTokenForRecipient(prisma, school.id, eventId, pupilId, guardianId);

    const stored = await prisma.secureAccessToken.findFirst({ where: { schoolId: school.id, eventId } });
    expect(stored).not.toBeNull();
    expect(stored!.tokenHash).toEqual(hashToken(issued.raw));
    // The raw token value must not be stored anywhere on the record.
    expect(JSON.stringify(stored)).not.toContain(issued.raw);
  });

  it("issues high-entropy, unique tokens", async () => {
    const { school, eventId, pupilId, guardianId } = await setup();
    const a = await issueTokenForRecipient(prisma, school.id, eventId, pupilId, guardianId);
    const b = await issueTokenForRecipient(prisma, school.id, eventId, pupilId, guardianId);
    expect(a.raw).not.toEqual(b.raw);
    expect(a.raw.length).toBeGreaterThanOrEqual(43); // 32 bytes base64url
  });
});

describe("token validation", () => {
  beforeEach(resetDb);

  it("validates a good token and records lastUsedAt", async () => {
    const { school, eventId, pupilId, guardianId } = await setup();
    const issued = await issueTokenForRecipient(prisma, school.id, eventId, pupilId, guardianId);

    const result = await validateToken(prisma, issued.raw);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok result");
    expect(result.binding.eventId).toEqual(eventId);
    expect(result.binding.pupilId).toEqual(pupilId);
    expect(result.binding.guardianId).toEqual(guardianId);
    // Normal bulk-issue path (issueTokenForRecipient without options) never
    // sets deadlineExempt — only the staff reissue flow does.
    expect(result.binding.deadlineExempt).toBe(false);

    const stored = await prisma.secureAccessToken.findUnique({ where: { tokenHash: hashToken(issued.raw) } });
    expect(stored!.lastUsedAt).not.toBeNull();
  });

  it("rejects an unknown or missing token with reason not_found", async () => {
    expect(await validateToken(prisma, "totally-made-up")).toEqual({ ok: false, reason: "not_found" });
    expect(await validateToken(prisma, "")).toEqual({ ok: false, reason: "not_found" });
  });

  it("rejects an expired token with reason expired", async () => {
    const { school, eventId, pupilId, guardianId } = await setup();
    const expired = await issueTokenForRecipient(prisma, school.id, eventId, pupilId, guardianId);
    await prisma.secureAccessToken.update({
      where: { tokenHash: hashToken(expired.raw) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await validateToken(prisma, expired.raw)).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects a revoked token with reason revoked (distinct from expired/not_found)", async () => {
    const { school, eventId, pupilId, guardianId } = await setup();
    const revoked = await issueTokenForRecipient(prisma, school.id, eventId, pupilId, guardianId);
    await prisma.secureAccessToken.update({
      where: { tokenHash: hashToken(revoked.raw) },
      data: { revokedAt: new Date() },
    });
    expect(await validateToken(prisma, revoked.raw)).toEqual({ ok: false, reason: "revoked" });
  });
});

describe("reissue", () => {
  beforeEach(resetDb);

  it("revokes the old token and issues a new working one", async () => {
    const { adminCtx, school, eventId, pupilId, guardianId } = await setup();
    const first = await issueTokenForRecipient(prisma, school.id, eventId, pupilId, guardianId);

    const reissued = await reissueLink(prisma, adminCtx, { eventId, pupilId, guardianId });
    // Old token no longer valid, and specifically reported as revoked (not
    // merely not-found), since a reissue explicitly revokes it.
    expect(await validateToken(prisma, first.raw)).toEqual({ ok: false, reason: "revoked" });
    const newResult = await validateToken(prisma, reissued.raw);
    expect(newResult.ok).toBe(true);
  });

  it("marks a reissued token's binding as deadlineExempt, unlike a normally issued token", async () => {
    const { adminCtx, school, eventId, pupilId, guardianId } = await setup();
    const reissued = await reissueLink(prisma, adminCtx, { eventId, pupilId, guardianId });

    const result = await validateToken(prisma, reissued.raw);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok result");
    expect(result.binding.deadlineExempt).toBe(true);

    // A separately, normally bulk-issued token for the same recipient is
    // unaffected — deadlineExempt is per-token, not somehow global.
    const normal = await issueTokenForRecipient(prisma, school.id, eventId, pupilId, guardianId);
    const normalResult = await validateToken(prisma, normal.raw);
    expect(normalResult.ok).toBe(true);
    if (!normalResult.ok) throw new Error("expected ok result");
    expect(normalResult.binding.deadlineExempt).toBe(false);
  });

  it("cannot reissue for an event in another school", async () => {
    const a = await setup();
    const b = await createSchoolWithAdmin("School B");
    await expect(
      reissueLink(prisma, b.adminCtx, {
        eventId: a.eventId,
        pupilId: a.pupilId,
        guardianId: a.guardianId,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
