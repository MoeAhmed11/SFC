import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import {
  archivePupil,
  createClass,
  createPupilRecord,
  getPupil,
  listPupils,
  updatePupil,
} from "@/server/services/dataService";
import { createSchoolWithAdmin, ctxFor, resetDb } from "./helpers";

// Pupil roster edit/archive (Requirement 1 of the MVP admin & consent
// enhancements spec). Creation is already covered by data-management.test.ts;
// these tests focus on update/archive/get and the externalRef immutability
// rule that's new here.

describe("pupil admin: updatePupil", () => {
  beforeEach(resetDb);

  it("admin can update first name, last name, and class", async () => {
    const { adminCtx } = await createSchoolWithAdmin();
    const cls = await createClass(prisma, adminCtx, { name: "Year 4" });
    const pupil = await createPupilRecord(prisma, adminCtx, { firstName: "Pat", lastName: "One" });

    await updatePupil(prisma, adminCtx, pupil.id, {
      firstName: "Patricia",
      lastName: "Uno",
      classGroupId: cls.id,
    });

    const updated = await getPupil(prisma, adminCtx, pupil.id);
    expect(updated.firstName).toEqual("Patricia");
    expect(updated.lastName).toEqual("Uno");
    expect(updated.classGroupId).toEqual(cls.id);
  });

  it("clears the class when classGroupId is set to null", async () => {
    const { adminCtx } = await createSchoolWithAdmin();
    const cls = await createClass(prisma, adminCtx, { name: "Year 5" });
    const pupil = await createPupilRecord(prisma, adminCtx, {
      firstName: "Pat",
      lastName: "Two",
      classGroupId: cls.id,
    });

    await updatePupil(prisma, adminCtx, pupil.id, { classGroupId: null });

    const updated = await getPupil(prisma, adminCtx, pupil.id);
    expect(updated.classGroupId).toBeNull();
  });

  it("silently ignores an externalRef in the input — it is never accepted or changed", async () => {
    const { adminCtx } = await createSchoolWithAdmin();
    const pupil = await createPupilRecord(prisma, adminCtx, {
      firstName: "Pat",
      lastName: "Three",
      externalRef: "REF-001",
    });

    // updatePupilSchema has no externalRef field at all, so even if a caller
    // (or a malicious client bypassing the UI) sends one, it's dropped by
    // Zod's default stripping behaviour and never reaches the repository.
    await updatePupil(
      prisma,
      adminCtx,
      pupil.id,
      { firstName: "Patricia", externalRef: "HACKED" } as unknown as Parameters<typeof updatePupil>[3],
    );

    const updated = await getPupil(prisma, adminCtx, pupil.id);
    expect(updated.externalRef).toEqual("REF-001");
    expect(updated.firstName).toEqual("Patricia");
  });

  it("rejects a class from another school (tenant guard)", async () => {
    const a = await createSchoolWithAdmin("School A");
    const b = await createSchoolWithAdmin("School B");
    const classB = await createClass(prisma, b.adminCtx, { name: "Year 6" });
    const pupilA = await createPupilRecord(prisma, a.adminCtx, { firstName: "X", lastName: "Y" });

    await expect(
      updatePupil(prisma, a.adminCtx, pupilA.id, { classGroupId: classB.id }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("throws NotFoundError for a pupil in a different school", async () => {
    const a = await createSchoolWithAdmin("School A");
    const b = await createSchoolWithAdmin("School B");
    const pupilB = await createPupilRecord(prisma, b.adminCtx, { firstName: "X", lastName: "Y" });

    await expect(
      updatePupil(prisma, a.adminCtx, pupilB.id, { firstName: "Nope" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("throws ValidationError for an empty first name", async () => {
    const { adminCtx } = await createSchoolWithAdmin();
    const pupil = await createPupilRecord(prisma, adminCtx, { firstName: "Pat", lastName: "Four" });

    await expect(updatePupil(prisma, adminCtx, pupil.id, { firstName: "" })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("organiser cannot update a pupil (data.manage required)", async () => {
    const { school, adminCtx } = await createSchoolWithAdmin();
    const organiserCtx = ctxFor(school.id, "org-1", "organiser");
    const pupil = await createPupilRecord(prisma, adminCtx, { firstName: "Pat", lastName: "Five" });

    await expect(
      updatePupil(prisma, organiserCtx, pupil.id, { firstName: "Nope" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("writes a pupil.updated audit entry with the changed fields", async () => {
    const { school, adminCtx } = await createSchoolWithAdmin();
    const pupil = await createPupilRecord(prisma, adminCtx, { firstName: "Pat", lastName: "Six" });

    await updatePupil(prisma, adminCtx, pupil.id, { firstName: "Patricia" });

    const entry = await prisma.auditLog.findFirst({
      where: { schoolId: school.id, action: "pupil.updated", entityId: pupil.id },
    });
    expect(entry).not.toBeNull();
    const meta = JSON.parse(entry!.metadata) as Record<string, unknown>;
    expect(meta.firstName).toEqual("Patricia");
  });
});

describe("pupil admin: archivePupil", () => {
  beforeEach(resetDb);

  it("sets status to archived rather than deleting the row", async () => {
    const { adminCtx } = await createSchoolWithAdmin();
    const pupil = await createPupilRecord(prisma, adminCtx, { firstName: "Pat", lastName: "Seven" });

    await archivePupil(prisma, adminCtx, pupil.id);

    const archived = await getPupil(prisma, adminCtx, pupil.id);
    expect(archived.status).toEqual("archived");
  });

  it("excludes archived pupils from the default (active) roster listing", async () => {
    const { adminCtx } = await createSchoolWithAdmin();
    const pupil = await createPupilRecord(prisma, adminCtx, { firstName: "Pat", lastName: "Eight" });
    await archivePupil(prisma, adminCtx, pupil.id);

    const activeOnly = await listPupils(prisma, adminCtx, { status: "active" });
    expect(activeOnly.some((p) => p.id === pupil.id)).toBe(false);

    const archivedOnly = await listPupils(prisma, adminCtx, { status: "archived" });
    expect(archivedOnly.some((p) => p.id === pupil.id)).toBe(true);

    // Unfiltered listing still finds it directly.
    const found = await getPupil(prisma, adminCtx, pupil.id);
    expect(found.id).toEqual(pupil.id);
  });

  it("organiser cannot archive a pupil (data.manage required)", async () => {
    const { school, adminCtx } = await createSchoolWithAdmin();
    const organiserCtx = ctxFor(school.id, "org-1", "organiser");
    const pupil = await createPupilRecord(prisma, adminCtx, { firstName: "Pat", lastName: "Nine" });

    await expect(archivePupil(prisma, organiserCtx, pupil.id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("throws NotFoundError for a pupil in a different school", async () => {
    const a = await createSchoolWithAdmin("School A");
    const b = await createSchoolWithAdmin("School B");
    const pupilB = await createPupilRecord(prisma, b.adminCtx, { firstName: "X", lastName: "Y" });

    await expect(archivePupil(prisma, a.adminCtx, pupilB.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("writes a pupil.archived audit entry", async () => {
    const { school, adminCtx } = await createSchoolWithAdmin();
    const pupil = await createPupilRecord(prisma, adminCtx, { firstName: "Pat", lastName: "Ten" });

    await archivePupil(prisma, adminCtx, pupil.id);

    const entry = await prisma.auditLog.findFirst({
      where: { schoolId: school.id, action: "pupil.archived", entityId: pupil.id },
    });
    expect(entry).not.toBeNull();
  });
});

describe("pupil admin: getPupil", () => {
  beforeEach(resetDb);

  it("returns the pupil when found in the actor's school", async () => {
    const { adminCtx } = await createSchoolWithAdmin();
    const pupil = await createPupilRecord(prisma, adminCtx, { firstName: "Pat", lastName: "Eleven" });

    const found = await getPupil(prisma, adminCtx, pupil.id);
    expect(found.id).toEqual(pupil.id);
  });

  it("throws NotFoundError for a pupil in a different school", async () => {
    const a = await createSchoolWithAdmin("School A");
    const b = await createSchoolWithAdmin("School B");
    const pupilB = await createPupilRecord(prisma, b.adminCtx, { firstName: "X", lastName: "Y" });

    await expect(getPupil(prisma, a.adminCtx, pupilB.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("organiser can view a pupil (data.view only)", async () => {
    const { school, adminCtx } = await createSchoolWithAdmin();
    const organiserCtx = ctxFor(school.id, "org-1", "organiser");
    const pupil = await createPupilRecord(prisma, adminCtx, { firstName: "Pat", lastName: "Twelve" });

    await expect(getPupil(prisma, organiserCtx, pupil.id)).resolves.toBeTruthy();
  });
});
