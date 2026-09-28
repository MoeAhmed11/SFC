import type { Db } from "@/server/db";
import { prisma } from "@/server/db";
import { recordAudit } from "@/server/audit/audit";
import { ForbiddenError, ValidationError } from "@/server/errors";
import { requireCapability, type StaffContext } from "@/server/tenancy/context";
import { importRowSchema, type ImportRow } from "@/server/validation";
import { detectDelimiter, parseCsv } from "@/server/csv/parse";
import { resolveColumnIndexes, type ImportColumn } from "@/server/csv/template";
import { createClassGroup, findClassByNameInSchool } from "@/server/repositories/classRepository";
import { createPupil, findPupilByExternalRef } from "@/server/repositories/pupilRepository";
import {
  createGuardian,
  findGuardianByEmailInSchool,
} from "@/server/repositories/guardianRepository";
import {
  clearPrimaryForPupil,
  upsertRelationship,
} from "@/server/repositories/relationshipRepository";

// CSV roster import (FR-10). Two steps:
//  - validateImport: parse + validate every row, returning a PREVIEW with
//    per-row errors. NOTHING is written. Staff review before committing.
//  - commitImport: re-validates and writes within a single transaction; a bad
//    row aborts the whole import (all-or-nothing) so a partial roster is never
//    persisted.
//
// Cross-school prevention (FR-10): all reads/writes are scoped to ctx.schoolId
// only — the CSV cannot target another tenant because no schoolId is taken from
// the file.
//
// Privacy (FR-10 / Section 11): raw CSV contents and personal values are NEVER
// logged. Audit entries and error messages carry row numbers and counts only.

export interface RowError {
  row: number; // 1-based data row number (excludes header)
  message: string;
}

export interface ImportPreview {
  totalRows: number;
  validRows: number;
  errors: RowError[];
  // Parsed valid rows, kept in memory for an immediate commit. Not logged.
  rows: ImportRow[];
}

export interface ImportResult {
  pupilsCreated: number;
  pupilsMatched: number;
  guardiansCreated: number;
  guardiansMatched: number;
  classesCreated: number;
  relationshipsUpserted: number;
}

function parseAndValidate(csv: string): ImportPreview {
  const grid = parseCsv(csv, detectDelimiter(csv));
  if (grid.length === 0) {
    return { totalRows: 0, validRows: 0, errors: [{ row: 0, message: "The file is empty." }], rows: [] };
  }

  const header = grid[0]!;
  const { indexes, missing } = resolveColumnIndexes(header);
  if (missing.length > 0) {
    return {
      totalRows: 0,
      validRows: 0,
      errors: [{ row: 0, message: `Missing required columns: ${missing.join(", ")}.` }],
      rows: [],
    };
  }

  const at = (cols: string[], name: ImportColumn): string => {
    const idx = indexes[name];
    return idx === undefined ? "" : (cols[idx] ?? "").trim();
  };

  const errors: RowError[] = [];
  const rows: ImportRow[] = [];

  for (let r = 1; r < grid.length; r++) {
    const cols = grid[r]!;
    const candidate = {
      pupilFirstName: at(cols, "pupil_first_name"),
      pupilLastName: at(cols, "pupil_last_name"),
      pupilExternalRef: at(cols, "pupil_external_ref"),
      className: at(cols, "class_name"),
      guardianName: at(cols, "guardian_name"),
      guardianEmail: at(cols, "guardian_email"),
      relationship: at(cols, "relationship"),
    };
    const parsed = importRowSchema.safeParse(candidate);
    if (!parsed.success) {
      // Report field-level problems WITHOUT echoing the offending values.
      const fields = [...new Set(parsed.error.issues.map((i) => String(i.path[0] ?? "row")))];
      errors.push({ row: r, message: `Invalid or missing: ${fields.join(", ")}.` });
      continue;
    }
    rows.push(parsed.data);
  }

  return { totalRows: grid.length - 1, validRows: rows.length, errors, rows };
}

export function validateImport(ctx: StaffContext, csv: string): ImportPreview {
  requireCapability(ctx, "data.import");
  return parseAndValidate(csv);
}

export async function commitImport(db: Db, ctx: StaffContext, csv: string): Promise<ImportResult> {
  requireCapability(ctx, "data.import");
  if (!ctx.schoolId) throw new ForbiddenError("No tenant context.");

  const preview = parseAndValidate(csv);
  if (preview.errors.length > 0) {
    // Do not import a partial roster; caller should fix errors first.
    throw new ValidationError(
      `Import has ${preview.errors.length} error(s); resolve them before committing.`,
    );
  }
  if (preview.validRows === 0) {
    throw new ValidationError("No valid rows to import.");
  }

  const result: ImportResult = {
    pupilsCreated: 0,
    pupilsMatched: 0,
    guardiansCreated: 0,
    guardiansMatched: 0,
    classesCreated: 0,
    relationshipsUpserted: 0,
  };

  await prisma.$transaction(async (txRaw) => {
    const tx = txRaw as unknown as Db;
    // Cache class lookups within this import to avoid repeat queries.
    const classCache = new Map<string, string>();

    for (const row of preview.rows) {
      // Class — create on first sight (scoped to this school).
      let classId = classCache.get(row.className);
      if (!classId) {
        const existingClass = await findClassByNameInSchool(tx, ctx.schoolId, row.className);
        if (existingClass) {
          classId = existingClass.id;
        } else {
          const created = await createClassGroup(tx, { schoolId: ctx.schoolId, name: row.className });
          classId = created.id;
          result.classesCreated += 1;
        }
        classCache.set(row.className, classId);
      }

      // Pupil — match by externalRef when supplied, else create.
      let pupilId: string;
      const existingPupil = row.pupilExternalRef
        ? await findPupilByExternalRef(tx, ctx.schoolId, row.pupilExternalRef)
        : null;
      if (existingPupil) {
        pupilId = existingPupil.id;
        result.pupilsMatched += 1;
      } else {
        const createdPupil = await createPupil(tx, {
          schoolId: ctx.schoolId,
          firstName: row.pupilFirstName,
          lastName: row.pupilLastName,
          classGroupId: classId,
          externalRef: row.pupilExternalRef ?? null,
        });
        pupilId = createdPupil.id;
        result.pupilsCreated += 1;
      }

      // Guardian — match by email within the school, else create.
      let guardianId: string;
      const existingGuardian = await findGuardianByEmailInSchool(tx, ctx.schoolId, row.guardianEmail);
      if (existingGuardian) {
        guardianId = existingGuardian.id;
        result.guardiansMatched += 1;
      } else {
        const createdGuardian = await createGuardian(tx, {
          schoolId: ctx.schoolId,
          name: row.guardianName,
          email: row.guardianEmail,
        });
        guardianId = createdGuardian.id;
        result.guardiansCreated += 1;
      }

      // Relationship — the imported guardian is the pupil's single primary
      // contact (decision 17.2). Clear any existing primary first.
      await clearPrimaryForPupil(tx, ctx.schoolId, pupilId);
      await upsertRelationship(tx, {
        schoolId: ctx.schoolId,
        pupilId,
        guardianId,
        relationship: row.relationship ?? null,
        isAuthorised: true,
        isPrimaryContact: true,
      });
      result.relationshipsUpserted += 1;
    }
  });

  // Audit: counts only, never row contents or personal data.
  await recordAudit(db, {
    schoolId: ctx.schoolId,
    actorType: "staff",
    actorId: ctx.staffUserId,
    action: "data.imported",
    entityType: "CsvImport",
    metadata: {
      pupilsCreated: result.pupilsCreated,
      pupilsMatched: result.pupilsMatched,
      guardiansCreated: result.guardiansCreated,
      guardiansMatched: result.guardiansMatched,
      classesCreated: result.classesCreated,
      relationshipsUpserted: result.relationshipsUpserted,
    },
  });

  return result;
}
