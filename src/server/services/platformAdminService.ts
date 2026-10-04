import type { Db } from "@/server/db";
import { ConflictError, ValidationError } from "@/server/errors";
import type { PlatformContext } from "@/server/platform/context";
import { recordPlatformAudit } from "@/server/repositories/platformAuditRepository";
import {
  createSchool,
  findSchoolById,
  findSchoolByName,
  getSchoolUsageCounts,
  listSchools,
} from "@/server/repositories/schoolRepository";
import { activateWithPassword, inviteStaff } from "@/server/services/staffAdminService";
import type { StaffContext } from "@/server/tenancy/context";
import { createSchoolAdminSchema, createSchoolWithAdminSchema } from "@/server/validation";

// Platform (super-user) administration actions. Unlike staffAdminService.ts,
// there is no capability check here — any authenticated PlatformContext may
// do everything in this file, since there is exactly one platform role (see
// src/server/platform/context.ts). Every action still writes a
// PlatformAuditLog entry, mirroring the "check -> act -> audit" convention
// used by the tenant-scoped services.

// Creates a brand-new school AND its first admin in one step — the
// HTTP-reachable equivalent of scripts/bootstrap-admin.ts, now gated behind
// platform authentication instead of shell/deploy access. Reuses
// inviteStaff + activateWithPassword exactly as the bootstrap script and
// prisma/seed.ts do: activateWithPassword has no capability check of its own
// (it exists only for trusted, non-HTTP-reachable callers), which is why this
// function — not a route — is the only thing allowed to call it directly.
export async function createSchoolWithFirstAdmin(
  db: Db,
  ctx: PlatformContext,
  input: {
    name: string;
    schoolType: "state" | "independent";
    timezone?: string;
    adminName: string;
    adminEmail: string;
    adminPassword: string;
  },
) {
  const parsed = createSchoolWithAdminSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid school/admin details.");
  }

  const existing = await findSchoolByName(db, parsed.data.name);
  if (existing) {
    throw new ConflictError(`A school named "${parsed.data.name}" already exists.`);
  }

  const school = await createSchool(db, {
    name: parsed.data.name,
    schoolType: parsed.data.schoolType,
    timezone: parsed.data.timezone,
  });

  // Bootstrap-only actor context for the staff-layer calls below; there is no
  // real staff user yet to attribute this to, mirroring
  // scripts/bootstrap-admin.ts and prisma/seed.ts's "bootstrap"/"seed" actor id.
  const bootstrapCtx: StaffContext = { schoolId: school.id, staffUserId: "bootstrap", role: "admin" };
  const admin = await inviteStaff(db, bootstrapCtx, {
    name: parsed.data.adminName,
    email: parsed.data.adminEmail,
    role: "admin",
  });
  await activateWithPassword(db, school.id, admin.id, { password: parsed.data.adminPassword });

  await recordPlatformAudit(db, {
    platformUserId: ctx.platformUserId,
    action: "platform.school_created",
    entityType: "School",
    entityId: school.id,
    metadata: { schoolName: school.name, adminEmail: admin.email },
  });

  return { school, admin };
}

// Adds a new admin to an EXISTING school. Distinct from staffAdminService's
// inviteStaff + the normal accept-invite flow: this is a platform-level
// escape hatch (e.g. a school's only admin is locked out) that activates the
// account immediately with a chosen password, rather than sending an
// invite-acceptance link.
export async function createAdminForSchool(
  db: Db,
  ctx: PlatformContext,
  schoolId: string,
  input: { adminName: string; adminEmail: string; adminPassword: string },
) {
  const parsed = createSchoolAdminSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid admin details.");
  }

  const school = await findSchoolById(db, schoolId);
  if (!school) throw new ValidationError("School not found.");

  const bootstrapCtx: StaffContext = { schoolId: school.id, staffUserId: "bootstrap", role: "admin" };
  const admin = await inviteStaff(db, bootstrapCtx, {
    name: parsed.data.adminName,
    email: parsed.data.adminEmail,
    role: "admin",
  });
  await activateWithPassword(db, school.id, admin.id, { password: parsed.data.adminPassword });

  await recordPlatformAudit(db, {
    platformUserId: ctx.platformUserId,
    action: "platform.admin_created",
    entityType: "School",
    entityId: school.id,
    metadata: { schoolName: school.name, adminEmail: admin.email },
  });

  return admin;
}

// Read-only: lists every school with its usage counts. View-only, per the
// platform layer's scope — no pupil/guardian/consent row content is read,
// only aggregate counts (see getSchoolUsageCounts).
export async function listSchoolsWithUsage(db: Db, _ctx: PlatformContext) {
  const schools = await listSchools(db);
  const usages = await Promise.all(schools.map((school) => getSchoolUsageCounts(db, school.id)));
  return schools.map((school, i) => ({ school, usage: usages[i]! }));
}

export async function getSchoolWithUsage(db: Db, _ctx: PlatformContext, schoolId: string) {
  const school = await findSchoolById(db, schoolId);
  if (!school) return null;
  const usage = await getSchoolUsageCounts(db, schoolId);
  return { school, usage };
}
