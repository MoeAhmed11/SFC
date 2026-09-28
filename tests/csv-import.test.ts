import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { ValidationError, ForbiddenError } from "@/server/errors";
import { detectDelimiter, parseCsv } from "@/server/csv/parse";
import { importTemplateCsv } from "@/server/csv/template";
import { commitImport, validateImport } from "@/server/csv/import";
import { listPupilsBySchool } from "@/server/repositories/pupilRepository";
import { listGuardiansBySchool } from "@/server/repositories/guardianRepository";
import { listRelationshipsForPupil } from "@/server/repositories/relationshipRepository";
import { createSchoolWithAdmin, ctxFor, resetDb } from "./helpers";

const HEADER = "pupil_first_name,pupil_last_name,pupil_external_ref,class_name,guardian_name,guardian_email,relationship";

describe("CSV parser", () => {
  it("parses quoted fields with commas and escaped quotes", () => {
    const csv = 'a,b\n"has,comma","she said ""hi"""\n';
    const grid = parseCsv(csv);
    expect(grid).toEqual([
      ["a", "b"],
      ["has,comma", 'she said "hi"'],
    ]);
  });

  it("handles CRLF and a trailing newline", () => {
    const grid = parseCsv("x,y\r\n1,2\r\n");
    expect(grid).toEqual([
      ["x", "y"],
      ["1", "2"],
    ]);
  });

  it("parses tab-delimited input when delimiter is explicitly tab", () => {
    const grid = parseCsv("a\tb\n1\t2\n", "\t");
    expect(grid).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("detectDelimiter", () => {
  it("detects tab-separated content pasted from a spreadsheet", () => {
    expect(detectDelimiter("pupil_first_name\tpupil_last_name\nAlex\tTaylor")).toBe("\t");
  });

  it("defaults to comma for normal CSV content", () => {
    expect(detectDelimiter(`${HEADER}\nAlex,Taylor,,Year 3,Sam Taylor,sam@example.test,Parent`)).toBe(",");
  });

  it("defaults to comma when a line mixes tabs and commas", () => {
    // A comma-delimited file with a stray literal tab inside a field should
    // still be treated as CSV, not silently mis-split on tabs.
    expect(detectDelimiter("a,b\tc\n1,2")).toBe(",");
  });
});

describe("import validation (preview)", () => {
  beforeEach(resetDb);

  it("reports missing required columns without importing", async () => {
    const { adminCtx } = await createSchoolWithAdmin();
    const preview = validateImport(adminCtx, "pupil_first_name,guardian_email\nAlex,x@example.test");
    expect(preview.errors[0]?.message).toMatch(/missing required columns/i);
    expect(preview.validRows).toBe(0);
  });

  it("flags invalid rows by field name without echoing values", async () => {
    const { adminCtx } = await createSchoolWithAdmin();
    const csv = `${HEADER}\nAlex,Taylor,,Year 3,Sam Taylor,not-an-email,Parent`;
    const preview = validateImport(adminCtx, csv);
    expect(preview.totalRows).toBe(1);
    expect(preview.validRows).toBe(0);
    expect(preview.errors).toHaveLength(1);
    expect(preview.errors[0]?.message).toMatch(/guardianEmail/);
    // The offending value must NOT appear in the error message.
    expect(preview.errors[0]?.message).not.toContain("not-an-email");
  });

  it("accepts a valid row and writes nothing during preview", async () => {
    const { adminCtx } = await createSchoolWithAdmin();
    const csv = `${HEADER}\nAlex,Taylor,P-1,Year 3,Sam Taylor,sam@example.test,Parent`;
    const preview = validateImport(adminCtx, csv);
    expect(preview.validRows).toBe(1);
    expect(preview.errors).toHaveLength(0);
    // Nothing persisted.
    expect(await listPupilsBySchool(prisma, adminCtx.schoolId)).toHaveLength(0);
  });

  it("the template is itself valid", async () => {
    const { adminCtx } = await createSchoolWithAdmin();
    const preview = validateImport(adminCtx, importTemplateCsv());
    expect(preview.errors).toHaveLength(0);
    expect(preview.validRows).toBe(1);
  });

  it("accepts the template content when tab-separated (pasted from Excel/Sheets)", async () => {
    const { adminCtx } = await createSchoolWithAdmin();
    const tsv = importTemplateCsv()
      .trim()
      .split("\n")
      .map((line) => line.split(",").join("\t"))
      .join("\n");
    const preview = validateImport(adminCtx, tsv);
    expect(preview.errors).toHaveLength(0);
    expect(preview.validRows).toBe(1);
  });
});

describe("import commit", () => {
  beforeEach(resetDb);

  it("imports pupils, guardians, classes and a primary-contact relationship", async () => {
    const { adminCtx, school } = await createSchoolWithAdmin();
    const csv =
      `${HEADER}\n` +
      `Alex,Taylor,P-1,Year 3,Sam Taylor,sam@example.test,Parent\n` +
      `Jo,Smith,P-2,Year 3,Chris Smith,chris@example.test,Carer\n`;

    const result = await commitImport(prisma, adminCtx, csv);
    expect(result.pupilsCreated).toBe(2);
    expect(result.guardiansCreated).toBe(2);
    expect(result.classesCreated).toBe(1); // shared "Year 3"
    expect(result.relationshipsUpserted).toBe(2);

    const pupils = await listPupilsBySchool(prisma, school.id);
    const alex = pupils.find((p) => p.externalRef === "P-1")!;
    const rels = await listRelationshipsForPupil(prisma, school.id, alex.id);
    expect(rels).toHaveLength(1);
    expect(rels[0]?.isPrimaryContact).toBe(true);
  });

  it("is idempotent on re-import by externalRef and guardian email", async () => {
    const { adminCtx, school } = await createSchoolWithAdmin();
    const csv = `${HEADER}\nAlex,Taylor,P-1,Year 3,Sam Taylor,sam@example.test,Parent\n`;

    await commitImport(prisma, adminCtx, csv);
    const second = await commitImport(prisma, adminCtx, csv);

    expect(second.pupilsCreated).toBe(0);
    expect(second.pupilsMatched).toBe(1);
    expect(second.guardiansCreated).toBe(0);
    expect(second.guardiansMatched).toBe(1);
    expect(await listPupilsBySchool(prisma, school.id)).toHaveLength(1);
    expect(await listGuardiansBySchool(prisma, school.id)).toHaveLength(1);
  });

  it("refuses to commit when any row is invalid (all-or-nothing)", async () => {
    const { adminCtx, school } = await createSchoolWithAdmin();
    const csv =
      `${HEADER}\n` +
      `Alex,Taylor,P-1,Year 3,Sam Taylor,sam@example.test,Parent\n` +
      `Jo,,P-2,Year 3,Chris Smith,chris@example.test,Carer\n`; // missing last name

    await expect(commitImport(prisma, adminCtx, csv)).rejects.toBeInstanceOf(ValidationError);
    // Nothing should have been written.
    expect(await listPupilsBySchool(prisma, school.id)).toHaveLength(0);
  });

  it("cannot be run by an organiser (needs data.import)", async () => {
    const { school } = await createSchoolWithAdmin();
    const organiserCtx = ctxFor(school.id, "org-1", "organiser");
    const csv = `${HEADER}\nAlex,Taylor,P-1,Year 3,Sam Taylor,sam@example.test,Parent\n`;
    await expect(commitImport(prisma, organiserCtx, csv)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("imports into the actor's school only (cross-school prevention)", async () => {
    const a = await createSchoolWithAdmin("School A");
    const b = await createSchoolWithAdmin("School B");
    const csv = `${HEADER}\nAlex,Taylor,P-1,Year 3,Sam Taylor,sam@example.test,Parent\n`;

    await commitImport(prisma, a.adminCtx, csv);
    // The data must land in School A, never School B.
    expect(await listPupilsBySchool(prisma, a.school.id)).toHaveLength(1);
    expect(await listPupilsBySchool(prisma, b.school.id)).toHaveLength(0);
  });

  it("audit records counts only, not personal data", async () => {
    const { adminCtx, school } = await createSchoolWithAdmin();
    const csv = `${HEADER}\nAlex,Taylor,P-1,Year 3,Sam Taylor,sam@example.test,Parent\n`;
    await commitImport(prisma, adminCtx, csv);

    const entry = await prisma.auditLog.findFirst({
      where: { schoolId: school.id, action: "data.imported" },
    });
    expect(entry).not.toBeNull();
    const meta = entry!.metadata;
    // No pupil/guardian names or emails in the audit metadata.
    expect(meta).not.toMatch(/sam@example\.test/);
    expect(meta).not.toMatch(/Taylor/);
    expect(JSON.parse(meta).pupilsCreated).toBe(1);
  });
});
