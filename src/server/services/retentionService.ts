import type { Db } from "@/server/db";
import { recordAudit } from "@/server/audit/audit";
import { NotFoundError } from "@/server/errors";
import { requireCapability, type StaffContext } from "@/server/tenancy/context";
import { parseSchoolSettings } from "@/server/schoolSettings";
import { findSchoolById } from "@/server/repositories/schoolRepository";
import {
  countExpiredRecords,
  deleteExpiredAuditLogs,
  deleteExpiredNotifications,
  deleteExpiredSupersededConsentResponses,
} from "@/server/repositories/retentionRepository";

// Data retention (decision 17.9): each school has a configurable retention
// period, defaulting to 3 years (schoolSettings.DEFAULT_RETENTION_YEARS).
// Records older than that period, anchored to when they were created/
// submitted, become eligible for deletion.
//
// IMPORTANT — what this intentionally does NOT delete:
//  - the CURRENT consent response for any pupil/event/guardian (only
//    superseded/corrected prior responses age out — Section 10);
//  - Pupil, Guardian, and PupilGuardianRelationship records (no retention
//    policy has been defined for these yet; deleting them would also break
//    referential history on Event/ConsentResponse rows that must remain
//    inspectable for their own retention window);
//  - anything for an event that has not yet reached a terminal state.
//
// There is no scheduled job that runs this automatically yet (no background
// worker is deployed — see PILOT_READINESS.md). It is exposed as an
// explicitly-invoked, admin-only, audited action, mirroring how
// processDueNotifications exists as a callable function awaiting a scheduler.

export interface RetentionCounts {
  supersededConsentResponses: number;
  notifications: number;
  auditLogs: number;
}

function cutoffFor(retentionYears: number, now: Date): Date {
  const cutoff = new Date(now);
  cutoff.setFullYear(cutoff.getFullYear() - retentionYears);
  return cutoff;
}

// Read-only preview of what a sweep would remove, using the school's
// configured retention period. Safe to call at any time; makes no changes.
export async function previewRetentionSweep(
  db: Db,
  ctx: StaffContext,
  now: Date = new Date(),
): Promise<RetentionCounts & { retentionYears: number; cutoff: Date }> {
  requireCapability(ctx, "school.manage_settings");
  const school = await findSchoolById(db, ctx.schoolId);
  if (!school) throw new NotFoundError("School not found.");

  const { dataRetentionYears } = parseSchoolSettings(school.settings);
  const cutoff = cutoffFor(dataRetentionYears, now);
  const counts = await countExpiredRecords(db, ctx.schoolId, cutoff);

  return {
    supersededConsentResponses: counts.supersededConsent,
    notifications: counts.notifications,
    auditLogs: counts.auditLogs,
    retentionYears: dataRetentionYears,
    cutoff,
  };
}

// Runs the sweep for a single school: permanently deletes expired records.
// Audited with counts only (never the deleted records' content).
export async function runRetentionSweep(
  db: Db,
  ctx: StaffContext,
  now: Date = new Date(),
): Promise<RetentionCounts> {
  requireCapability(ctx, "school.manage_settings");
  const school = await findSchoolById(db, ctx.schoolId);
  if (!school) throw new NotFoundError("School not found.");

  const { dataRetentionYears } = parseSchoolSettings(school.settings);
  const cutoff = cutoffFor(dataRetentionYears, now);

  const [consentResult, notificationResult, auditResult] = await Promise.all([
    deleteExpiredSupersededConsentResponses(db, ctx.schoolId, cutoff),
    deleteExpiredNotifications(db, ctx.schoolId, cutoff),
    deleteExpiredAuditLogs(db, ctx.schoolId, cutoff),
  ]);

  const counts: RetentionCounts = {
    supersededConsentResponses: consentResult.count,
    notifications: notificationResult.count,
    auditLogs: auditResult.count,
  };

  await recordAudit(db, {
    schoolId: ctx.schoolId,
    actorType: "staff",
    actorId: ctx.staffUserId,
    action: "retention.swept",
    entityType: "School",
    entityId: ctx.schoolId,
    metadata: { ...counts, retentionYears: dataRetentionYears },
  });

  return counts;
}
