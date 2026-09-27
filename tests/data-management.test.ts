import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { ForbiddenError, NotFoundError } from "@/server/errors";
import {
  createClass,
  createGuardianRecord,
  createPupilRecord,
  linkGuardianToPupil,
  listPupils,
} from "@/server/services/dataService";
import { listRelationshipsForPupil } from "@/server/repositories/relationshipRepository";
import { createSchoolWithAdmin, ctxFor, resetDb } from "./helpers";

describe("data management: RBAC", () => {
  beforeEach(resetDb);

  it("organiser can view but cannot create data", async () => {
    const { school, adminCtx } = await createSchoolWithAdmin();
    const organiserCtx = ctxFor(school.id, "org-1", "organiser");

    // View is allowed.
    await expect(listPupils(prisma, organiserCtx)).resolves.toBeInstanceOf(Array);

    // Mutations are forbidden.
    await expect(createClass(prisma, organiserCtx, { name: "Year 1" })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(
      createPupilRecord(prisma, organiserCtx, { firstName: "A", lastName: "B" }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    // Admin can create.
    await expect(createClass(prisma, adminCtx, { name: "Year 1" })).resolves.toBeTruthy();
  });
});

describe("data management: tenant isolation", () => {
  beforeEach(resetDb);

  it("cannot link a pupil to a guardian from another school", async () => {
    const a = await createSchoolWithAdmin("School A");
    const b = await createSchoolWithAdmin("School B");

    const pupilA = await createPupilRecord(prisma, a.adminCtx, { firstName: "Pat", lastName: "A" });
    const guardianB = await createGuardianRecord(prisma, b.adminCtx, {
      name: "G B",
      email: "gb@example.test",
    });

    // A's admin tries to attach B's guardian to A's pupil.
    await expect(
      linkGuardianToPupil(prisma, a.adminCtx, { pupilId: pupilA.id, guardianId: guardianB.id }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("pupil listing is scoped to the school", async () => {
    const a = await createSchoolWithAdmin("School A");
    const b = await createSchoolWithAdmin("School B");
    await createPupilRecord(prisma, a.adminCtx, { firstName: "OnlyA", lastName: "X" });

    const listB = await listPupils(prisma, b.adminCtx);
    expect(listB.some((p) => p.firstName === "OnlyA")).toBe(false);
  });

  it("rejects a class from another school when creating a pupil", async () => {
    const a = await createSchoolWithAdmin("School A");
    const b = await createSchoolWithAdmin("School B");
    const classB = await createClass(prisma, b.adminCtx, { name: "Year 6" });

    await expect(
      createPupilRecord(prisma, a.adminCtx, { firstName: "X", lastName: "Y", classGroupId: classB.id }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("primary-contact rule (decision 17.2)", () => {
  beforeEach(resetDb);

  it("keeps at most one primary contact per pupil", async () => {
    const { adminCtx } = await createSchoolWithAdmin();
    const pupil = await createPupilRecord(prisma, adminCtx, { firstName: "Kid", lastName: "One" });
    const g1 = await createGuardianRecord(prisma, adminCtx, { name: "G1", email: "g1@example.test" });
    const g2 = await createGuardianRecord(prisma, adminCtx, { name: "G2", email: "g2@example.test" });

    await linkGuardianToPupil(prisma, adminCtx, {
      pupilId: pupil.id,
      guardianId: g1.id,
      isPrimaryContact: true,
    });
    // Making g2 primary must demote g1.
    await linkGuardianToPupil(prisma, adminCtx, {
      pupilId: pupil.id,
      guardianId: g2.id,
      isPrimaryContact: true,
    });

    const rels = await listRelationshipsForPupil(prisma, adminCtx.schoolId, pupil.id);
    const primaries = rels.filter((r) => r.isPrimaryContact);
    expect(primaries).toHaveLength(1);
    expect(primaries[0]?.guardianId).toEqual(g2.id);
  });
});
