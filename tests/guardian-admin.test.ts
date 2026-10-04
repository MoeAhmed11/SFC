import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import {
  createGuardianRecord,
  createPupilRecord,
  getPupilGuardians,
  linkGuardianToPupil,
  updateGuardian,
} from "@/server/services/dataService";
import { createSchoolWithAdmin, ctxFor, resetDb } from "./helpers";

// Guardian contact-detail editing, and viewing a pupil's linked guardians
// with their relationship flags — the admin-facing extension of pupil
// editing (pupil-admin.test.ts) to also cover guardian contact details.

describe("guardian admin: updateGuardian", () => {
  beforeEach(resetDb);

  it("admin can update a guardian's name and email", async () => {
    const { adminCtx } = await createSchoolWithAdmin();
    const guardian = await createGuardianRecord(prisma, adminCtx, {
      name: "Sam Baker",
      email: "sam.baker@example.test",
    });

    await updateGuardian(prisma, adminCtx, guardian.id, {
      name: "Samantha Baker",
      email: "samantha.baker@example.test",
    });

    const updated = await prisma.guardian.findUnique({ where: { id: guardian.id } });
    expect(updated?.name).toEqual("Samantha Baker");
    expect(updated?.email).toEqual("samantha.baker@example.test");
  });

  it("allows updating just the name, leaving email unchanged", async () => {
    const { adminCtx } = await createSchoolWithAdmin();
    const guardian = await createGuardianRecord(prisma, adminCtx, {
      name: "Priya Clarke",
      email: "priya.clarke@example.test",
    });

    await updateGuardian(prisma, adminCtx, guardian.id, { name: "Priya C" });

    const updated = await prisma.guardian.findUnique({ where: { id: guardian.id } });
    expect(updated?.name).toEqual("Priya C");
    expect(updated?.email).toEqual("priya.clarke@example.test");
  });

  it("rejects an email already used by another guardian in the same school", async () => {
    const { adminCtx } = await createSchoolWithAdmin();
    await createGuardianRecord(prisma, adminCtx, { name: "G1", email: "taken@example.test" });
    const g2 = await createGuardianRecord(prisma, adminCtx, { name: "G2", email: "g2@example.test" });

    await expect(
      updateGuardian(prisma, adminCtx, g2.id, { email: "taken@example.test" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("allows a guardian to keep their own existing email unchanged", async () => {
    const { adminCtx } = await createSchoolWithAdmin();
    const guardian = await createGuardianRecord(prisma, adminCtx, {
      name: "Kwame Diallo",
      email: "kwame.diallo@example.test",
    });

    // Submitting the same email back (e.g. an edit form resubmitted
    // unchanged) must not be treated as a conflict with itself.
    await expect(
      updateGuardian(prisma, adminCtx, guardian.id, {
        name: "Kwame Diallo",
        email: "kwame.diallo@example.test",
      }),
    ).resolves.toBeUndefined();
  });

  it("a guardian in a different school is rejected (tenant guard)", async () => {
    const a = await createSchoolWithAdmin("School A");
    const b = await createSchoolWithAdmin("School B");
    const guardianB = await createGuardianRecord(prisma, b.adminCtx, {
      name: "G B",
      email: "gb@example.test",
    });

    await expect(
      updateGuardian(prisma, a.adminCtx, guardianB.id, { name: "Nope" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("throws ValidationError for an empty name", async () => {
    const { adminCtx } = await createSchoolWithAdmin();
    const guardian = await createGuardianRecord(prisma, adminCtx, {
      name: "Lin Evans",
      email: "lin.evans@example.test",
    });

    await expect(updateGuardian(prisma, adminCtx, guardian.id, { name: "" })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("organiser cannot update a guardian (data.manage required)", async () => {
    const { school, adminCtx } = await createSchoolWithAdmin();
    const organiserCtx = ctxFor(school.id, "org-1", "organiser");
    const guardian = await createGuardianRecord(prisma, adminCtx, {
      name: "Morgan Diallo",
      email: "morgan.diallo@example.test",
    });

    await expect(
      updateGuardian(prisma, organiserCtx, guardian.id, { name: "Nope" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("writes a guardian.updated audit entry with the changed fields", async () => {
    const { school, adminCtx } = await createSchoolWithAdmin();
    const guardian = await createGuardianRecord(prisma, adminCtx, {
      name: "Riley Evans",
      email: "riley.evans@example.test",
    });

    await updateGuardian(prisma, adminCtx, guardian.id, { name: "Riley E" });

    const entry = await prisma.auditLog.findFirst({
      where: { schoolId: school.id, action: "guardian.updated", entityId: guardian.id },
    });
    expect(entry).not.toBeNull();
    const meta = JSON.parse(entry!.metadata) as Record<string, unknown>;
    expect(meta.name).toEqual("Riley E");
  });
});

describe("guardian admin: getPupilGuardians", () => {
  beforeEach(resetDb);

  it("returns linked guardians with contact details and relationship flags", async () => {
    const { adminCtx } = await createSchoolWithAdmin();
    const pupil = await createPupilRecord(prisma, adminCtx, { firstName: "Alex", lastName: "Baker" });
    const guardian = await createGuardianRecord(prisma, adminCtx, {
      name: "Sam Baker",
      email: "sam.baker@example.test",
    });
    await linkGuardianToPupil(prisma, adminCtx, {
      pupilId: pupil.id,
      guardianId: guardian.id,
      relationship: "Mother",
      isAuthorised: true,
      isPrimaryContact: true,
    });

    const links = await getPupilGuardians(prisma, adminCtx, pupil.id);
    expect(links).toHaveLength(1);
    expect(links[0]?.guardian.name).toEqual("Sam Baker");
    expect(links[0]?.guardian.email).toEqual("sam.baker@example.test");
    expect(links[0]?.relationship).toEqual("Mother");
    expect(links[0]?.isAuthorised).toBe(true);
    expect(links[0]?.isPrimaryContact).toBe(true);
  });

  it("returns an empty list for a pupil with no linked guardians", async () => {
    const { adminCtx } = await createSchoolWithAdmin();
    const pupil = await createPupilRecord(prisma, adminCtx, { firstName: "Jordan", lastName: "Clarke" });

    const links = await getPupilGuardians(prisma, adminCtx, pupil.id);
    expect(links).toEqual([]);
  });

  it("throws NotFoundError for a pupil in a different school", async () => {
    const a = await createSchoolWithAdmin("School A");
    const b = await createSchoolWithAdmin("School B");
    const pupilB = await createPupilRecord(prisma, b.adminCtx, { firstName: "X", lastName: "Y" });

    await expect(getPupilGuardians(prisma, a.adminCtx, pupilB.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("organiser can view a pupil's guardians (data.view only)", async () => {
    const { school, adminCtx } = await createSchoolWithAdmin();
    const organiserCtx = ctxFor(school.id, "org-1", "organiser");
    const pupil = await createPupilRecord(prisma, adminCtx, { firstName: "Morgan", lastName: "Diallo" });

    await expect(getPupilGuardians(prisma, organiserCtx, pupil.id)).resolves.toEqual([]);
  });
});

describe("guardian admin: editing an existing relationship via linkGuardianToPupil", () => {
  beforeEach(resetDb);

  it("re-linking the same pupil+guardian pair edits the relationship instead of duplicating it", async () => {
    const { adminCtx } = await createSchoolWithAdmin();
    const pupil = await createPupilRecord(prisma, adminCtx, { firstName: "Riley", lastName: "Evans" });
    const guardian = await createGuardianRecord(prisma, adminCtx, {
      name: "Lin Evans",
      email: "lin.evans@example.test",
    });

    await linkGuardianToPupil(prisma, adminCtx, {
      pupilId: pupil.id,
      guardianId: guardian.id,
      relationship: "Mother",
      isAuthorised: true,
      isPrimaryContact: false,
    });
    await linkGuardianToPupil(prisma, adminCtx, {
      pupilId: pupil.id,
      guardianId: guardian.id,
      relationship: "Guardian",
      isAuthorised: false,
      isPrimaryContact: false,
    });

    const links = await getPupilGuardians(prisma, adminCtx, pupil.id);
    expect(links).toHaveLength(1);
    expect(links[0]?.relationship).toEqual("Guardian");
    expect(links[0]?.isAuthorised).toBe(false);
  });
});
