import type { Db } from "@/server/db";

// Tenant-scoped data access for the audit log viewer (Requirement 8 of the
// MVP admin & consent enhancements spec). AuditLog itself is append-only and
// written via src/server/audit/audit.ts — this repository is read-only.

export interface AuditLogFilter {
  actorId?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  from?: Date;
  to?: Date;
}

export interface AuditLogPage {
  skip: number;
  take: number;
}

function whereClause(schoolId: string, filter: AuditLogFilter) {
  return {
    schoolId,
    ...(filter.actorId ? { actorId: filter.actorId } : {}),
    ...(filter.action ? { action: filter.action } : {}),
    ...(filter.entityType ? { entityType: filter.entityType } : {}),
    ...(filter.entityId ? { entityId: filter.entityId } : {}),
    ...(filter.from || filter.to
      ? {
          createdAt: {
            ...(filter.from ? { gte: filter.from } : {}),
            ...(filter.to ? { lte: filter.to } : {}),
          },
        }
      : {}),
  };
}

export function listAuditLogs(db: Db, schoolId: string, filter: AuditLogFilter, page: AuditLogPage) {
  return db.auditLog.findMany({
    where: whereClause(schoolId, filter),
    orderBy: { createdAt: "desc" },
    skip: page.skip,
    take: page.take,
  });
}

export function countAuditLogs(db: Db, schoolId: string, filter: AuditLogFilter) {
  return db.auditLog.count({ where: whereClause(schoolId, filter) });
}

// Distinct action strings seen for this school, used to populate the action
// filter dropdown without hardcoding every possible action name (they're
// free-form strings written across many services, e.g. "staff.deleted",
// "consent.link_resent", "pupil.archived").
export async function listDistinctActions(db: Db, schoolId: string): Promise<string[]> {
  const rows = await db.auditLog.findMany({
    where: { schoolId },
    distinct: ["action"],
    select: { action: true },
    orderBy: { action: "asc" },
  });
  return rows.map((r) => r.action);
}
