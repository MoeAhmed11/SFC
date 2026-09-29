import { prisma } from "@/server/db";
import { createSchool } from "@/server/repositories/schoolRepository";
import { inviteStaff, activateWithPassword } from "@/server/services/staffAdminService";
import type { StaffContext } from "@/server/tenancy/context";
import type { StaffRole } from "@/server/domain";

// Test helpers. All data is synthetic (Section 18.4 — no real children's data).

// Satisfies the classic-complexity password policy (Requirement 6 of the MVP
// admin & consent enhancements spec): 12+ chars, upper, lower, digit, symbol.
export const TEST_PASSWORD = "Correct-Horse-Battery-Staple9";

// Remove all rows between tests for deterministic assertions. Order respects
// FK dependencies (children before parents).
export async function resetDb(): Promise<void> {
  await prisma.inviteToken.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.consentResponse.deleteMany();
  await prisma.secureAccessToken.deleteMany();
  await prisma.eventRecipient.deleteMany();
  await prisma.event.deleteMany();
  await prisma.pupilGuardianRelationship.deleteMany();
  await prisma.pupil.deleteMany();
  await prisma.guardian.deleteMany();
  await prisma.classGroup.deleteMany();
  await prisma.staffSession.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.staffUser.deleteMany();
  await prisma.school.deleteMany();
}

export async function createTestSchool(name = "Greenfield Primary") {
  return createSchool(prisma, { name, schoolType: "state", timezone: "Europe/London" });
}

// Creates a school with an active admin and returns a ready-to-use context.
// Uses the repository/services layer directly (Phase 1 has no HTTP layer yet).
export async function createSchoolWithAdmin(schoolName?: string) {
  const school = await createTestSchool(schoolName);
  const bootstrapCtx: StaffContext = {
    schoolId: school.id,
    staffUserId: "bootstrap",
    role: "admin",
  };
  const admin = await inviteStaff(prisma, bootstrapCtx, {
    name: "Admin User",
    email: `admin.${school.id}@example.test`,
    role: "admin",
  });
  await activateWithPassword(prisma, school.id, admin.id, { password: TEST_PASSWORD });
  const adminCtx: StaffContext = { schoolId: school.id, staffUserId: admin.id, role: "admin" };
  return { school, admin, adminCtx };
}

export function ctxFor(schoolId: string, staffUserId: string, role: StaffRole): StaffContext {
  return { schoolId, staffUserId, role };
}

// A coherent set of future event dates: deadline before start, start before end.
export function futureEventDates(daysAhead = 30) {
  const start = new Date(Date.now() + daysAhead * 24 * 3600 * 1000);
  const end = new Date(start.getTime() + 2 * 3600 * 1000);
  const deadline = new Date(start.getTime() - 7 * 24 * 3600 * 1000);
  return { startsAt: start, endsAt: end, consentDeadline: deadline };
}

// Creates an active pupil in a class with a primary-contact guardian, using the
// data services. Returns ids useful for event recipient assertions.
export async function createPupilWithPrimaryGuardian(
  adminCtx: StaffContext,
  opts: { className?: string; email?: string } = {},
) {
  const { createClass, createPupilRecord, createGuardianRecord, linkGuardianToPupil } = await import(
    "@/server/services/dataService"
  );
  const { findClassByNameInSchool } = await import("@/server/repositories/classRepository");
  const { prisma: db } = await import("@/server/db");
  const className = opts.className ?? `Class-${Math.random()}`;
  // Reuse the class if it already exists (multiple pupils can share a class).
  const existing = await findClassByNameInSchool(db, adminCtx.schoolId, className);
  const cls = existing ?? (await createClass(db, adminCtx, { name: className }));
  const pupil = await createPupilRecord(db, adminCtx, {
    firstName: "Kid",
    lastName: "Test",
    classGroupId: cls.id,
  });
  const guardian = await createGuardianRecord(db, adminCtx, {
    name: "Primary Guardian",
    email: opts.email ?? `pg.${Math.random().toString(36).slice(2)}@example.test`,
  });
  await linkGuardianToPupil(db, adminCtx, {
    pupilId: pupil.id,
    guardianId: guardian.id,
    isPrimaryContact: true,
  });
  return { classId: cls.id, pupilId: pupil.id, guardianId: guardian.id };
}
