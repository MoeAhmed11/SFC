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

export function listBySchool(db: Db, schoolId: string) {
  return db.staffUser.findMany({
    where: { schoolId },
    orderBy: { createdAt: "asc" },
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
