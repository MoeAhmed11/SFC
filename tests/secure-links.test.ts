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

    const binding = await validateToken(prisma, issued.raw);
    expect(binding).not.toBeNull();
    expect(binding!.eventId).toEqual(eventId);
    expect(binding!.pupilId).toEqual(pupilId);
    expect(binding!.guardianId).toEqual(guardianId);

    const stored = await prisma.secureAccessToken.findUnique({ where: { tokenHash: hashToken(issued.raw) } });
    expect(stored!.lastUsedAt).not.toBeNull();
  });

  it("rejects unknown, expired, and revoked tokens", async () => {
    const { school, eventId, pupilId, guardianId } = await setup();
    expect(await validateToken(prisma, "totally-made-up")).toBeNull();
    expect(await validateToken(prisma, "")).toBeNull();

    const expired = await issueTokenForRecipient(prisma, school.id, eventId, pupilId, guardianId);
    await prisma.secureAccessToken.update({
      where: { tokenHash: hashToken(expired.raw) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await validateToken(prisma, expired.raw)).toBeNull();

    const revoked = await issueTokenForRecipient(prisma, school.id, eventId, pupilId, guardianId);
    await prisma.secureAccessToken.update({
      where: { tokenHash: hashToken(revoked.raw) },
      data: { revokedAt: new Date() },
    });
    expect(await validateToken(prisma, revoked.raw)).toBeNull();
  });
});

describe("reissue", () => {
  beforeEach(resetDb);

  it("revokes the old token and issues a new working one", async () => {
    const { adminCtx, school, eventId, pupilId, guardianId } = await setup();
    const first = await issueTokenForRecipient(prisma, school.id, eventId, pupilId, guardianId);

    const reissued = await reissueLink(prisma, adminCtx, { eventId, pupilId, guardianId });
    // Old token no longer valid; new one works.
    expect(await validateToken(prisma, first.raw)).toBeNull();
    expect(await validateToken(prisma, reissued.raw)).not.toBeNull();
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
