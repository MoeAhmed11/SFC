import type { Db } from "@/server/db";
import { recordAudit } from "@/server/audit/audit";
import { NotFoundError } from "@/server/errors";
import { requireCapability, type StaffContext } from "@/server/tenancy/context";
import { findSchoolById, updateSchoolSettingsRaw } from "@/server/repositories/schoolRepository";
import {
  DEFAULT_SCHOOL_SETTINGS,
  MAX_RETENTION_YEARS,
  MIN_RETENTION_YEARS,
  parseSchoolSettings,
  type SchoolSettings,
} from "@/server/schoolSettings";
import { ValidationError } from "@/server/errors";

// Admin-only, audited updates to school policy settings (decisions
// 17.3–17.5, 17.9). These flags govern legally/operationally significant
// behaviour — whether consent can be edited, submitted late, recorded
// offline, or how long records are retained — so changing them is restricted
// to admins and logged (Section 7 FR-01, Section 11).

export async function getSchoolSettings(db: Db, ctx: StaffContext): Promise<SchoolSettings> {
  const school = await findSchoolById(db, ctx.schoolId);
  if (!school) throw new NotFoundError("School not found.");
  return parseSchoolSettings(school.settings);
}

export async function updateSchoolSettings(
  db: Db,
  ctx: StaffContext,
  patch: Partial<SchoolSettings>,
): Promise<SchoolSettings> {
  requireCapability(ctx, "school.manage_settings");
  const school = await findSchoolById(db, ctx.schoolId);
  if (!school) throw new NotFoundError("School not found.");

  if (
    patch.dataRetentionYears !== undefined &&
    (!Number.isFinite(patch.dataRetentionYears) ||
      patch.dataRetentionYears < MIN_RETENTION_YEARS ||
      patch.dataRetentionYears > MAX_RETENTION_YEARS)
  ) {
    throw new ValidationError(
      `Data retention must be between ${MIN_RETENTION_YEARS} and ${MAX_RETENTION_YEARS} years.`,
    );
  }

  const current = parseSchoolSettings(school.settings);
  const next: SchoolSettings = {
    allowConsentEditing: patch.allowConsentEditing ?? current.allowConsentEditing,
    allowLateConsent: patch.allowLateConsent ?? current.allowLateConsent,
    allowOfflineConsent: patch.allowOfflineConsent ?? current.allowOfflineConsent,
    dataRetentionYears: patch.dataRetentionYears ?? current.dataRetentionYears,
  };

  await updateSchoolSettingsRaw(db, ctx.schoolId, JSON.stringify(next));

  await recordAudit(db, {
    schoolId: ctx.schoolId,
    actorType: "staff",
    actorId: ctx.staffUserId,
    action: "school.settings_updated",
    entityType: "School",
    entityId: ctx.schoolId,
    // Booleans only — no personal data, safe to log verbatim.
    metadata: { ...next },
  });

  return next;
}

export { DEFAULT_SCHOOL_SETTINGS };
