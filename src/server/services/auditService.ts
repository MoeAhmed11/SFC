import type { Db } from "@/server/db";
import { requireCapability, type StaffContext } from "@/server/tenancy/context";
import {
  countAuditLogs,
  listAuditLogs,
  listDistinctActions,
  type AuditLogFilter,
} from "@/server/repositories/auditRepository";

// Audit log viewer (Requirement 8 of the MVP admin & consent enhancements
// spec) — admin-only, read-only, tenant-scoped, with pagination and filters.

export interface AuditLogPageInput {
  page: number; // 1-indexed
  pageSize: number;
}

export interface AuditLogEntry {
  id: string;
  actorType: string;
  actorId: string | null;
  // Resolved staff name where possible. Falls back to "(deleted user)" when
  // actorId is set but no matching StaffUser exists any more (e.g. after a
  // hard delete per Requirement 5) — AuditLog.actorId has no FK, so the row
  // itself is unaffected by that deletion, only the ability to resolve a name.
  actorName: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: string;
  createdAt: Date;
}

export interface AuditLogResult {
  rows: AuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
}

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

export async function getAuditLog(
  db: Db,
  ctx: StaffContext,
  filter: AuditLogFilter,
  pageInput: Partial<AuditLogPageInput> = {},
): Promise<AuditLogResult> {
  requireCapability(ctx, "audit.view");

  const page = pageInput.page && pageInput.page > 0 ? Math.floor(pageInput.page) : 1;
  const pageSize =
    pageInput.pageSize && pageInput.pageSize > 0
      ? Math.min(Math.floor(pageInput.pageSize), MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE;
  const skip = (page - 1) * pageSize;

  const [rows, total] = await Promise.all([
    listAuditLogs(db, ctx.schoolId, filter, { skip, take: pageSize }),
    countAuditLogs(db, ctx.schoolId, filter),
  ]);

  // Resolve actor names best-effort in one batched query rather than N+1.
  const staffIds = [...new Set(rows.map((r) => r.actorId).filter((id): id is string => Boolean(id)))];
  const staffRows =
    staffIds.length > 0
      ? await db.staffUser.findMany({
          where: { id: { in: staffIds }, schoolId: ctx.schoolId },
          select: { id: true, name: true },
        })
      : [];
  const nameById = new Map(staffRows.map((s) => [s.id, s.name]));

  return {
    rows: rows.map((r) => ({
      id: r.id,
      actorType: r.actorType,
      actorId: r.actorId,
      actorName: r.actorId ? nameById.get(r.actorId) ?? "(deleted user)" : null,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      metadata: r.metadata,
      createdAt: r.createdAt,
    })),
    total,
    page,
    pageSize,
  };
}

// Distinct action names for this school, for the filter dropdown.
export async function getAuditActionOptions(db: Db, ctx: StaffContext): Promise<string[]> {
  requireCapability(ctx, "audit.view");
  return listDistinctActions(db, ctx.schoolId);
}
