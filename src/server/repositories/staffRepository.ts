import type { Db } from "@/server/db";
import type { StaffRole, StaffStatus } from "@/server/domain";

// Tenant-scoped data access for staff users. EVERY method requires a schoolId
// and includes it in the query, so a caller cannot accidentally read or mutate
// another tenant's rows (Section 5.4). Higher layers must pass the schoolId
// from the verified session, never from client input.

export interface CreateStaffInput {
  schoolId: string;
  name: string;
  email: string;
  role: StaffRole;
  status: StaffStatus;
  passwordHash?: string | null;
}

export function findByEmailInSchool(db: Db, schoolId: string, email: string) {
  return db.staffUser.findUnique({
    where: { schoolId_email: { schoolId, email } },
  });
}

// Looks up ACTIVE staff by email ACROSS ALL SCHOOLS. Used only at login, before
// any tenant context is established, to resolve which school a login attempt
// belongs to (email is unique per-school, not globally — Section 3.1). Every
// other repository method in this codebase requires a schoolId; this is the
// sole, deliberate exception, scoped to the login flow only.
export function findActiveByEmailAcrossSchools(db: Db, email: string) {
  return db.staffUser.findMany({ where: { email, status: "active" } });
}

export function findByIdInSchool(db: Db, schoolId: string, id: string) {
  return db.staffUser.findFirst({ where: { id, schoolId } });
}

// Excludes passwordHash: this is the roster-listing query, and its only
// caller (listStaff in staffAdminService.ts) feeds the staff list API/page —
// there is no reason for a password hash to ever leave the server via this
// path. Other lookups here (findByEmailInSchool, findByIdInSchool) still
// return the full row because auth code needs passwordHash to verify a login
// or set a new one.
export function listBySchool(db: Db, schoolId: string) {
  return db.staffUser.findMany({
    where: { schoolId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      schoolId: true,
      name: true,
      email: true,
      role: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export function createStaff(db: Db, input: CreateStaffInput) {
  return db.staffUser.create({
    data: {
      schoolId: input.schoolId,
      name: input.name,
      email: input.email,
      role: input.role,
      status: input.status,
      passwordHash: input.passwordHash ?? null,
    },
  });
}

// Scoped update: the where clause is filtered by both id AND schoolId via
// updateMany so a cross-tenant id can never match.
export async function updateStaffScoped(
  db: Db,
  schoolId: string,
  id: string,
  data: { role?: StaffRole; status?: StaffStatus; passwordHash?: string | null },
): Promise<number> {
  const result = await db.staffUser.updateMany({
    where: { id, schoolId },
    data,
  });
  return result.count;
}

// Scoped hard delete (Requirement 5). Cascades StaffSession and InviteToken
// rows per the schema's onDelete: Cascade — safe to remove unconditionally.
// The caller (deleteStaff in staffAdminService.ts) is responsible for
// checking there are no Event rows referencing this staff user first, since
// Event.createdById has no onDelete rule and would otherwise fail the FK
// constraint (or, on a provider that allows it, silently orphan attribution).
export async function deleteStaffScoped(db: Db, schoolId: string, id: string): Promise<number> {
  const result = await db.staffUser.deleteMany({ where: { id, schoolId } });
  return result.count;
}
