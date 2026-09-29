import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { listStaff, inviteStaff, activateWithPassword } from "@/server/services/staffAdminService";
import { createSchoolWithAdmin, resetDb, TEST_PASSWORD } from "./helpers";

// Regression test: GET /api/staff (and the /staff page) must never expose a
// staff member's passwordHash. listStaff -> listBySchool previously returned
// the full StaffUser row via a plain findMany with no field selection, so the
// hash reached the JSON response body directly. Fixed by adding an explicit
// `select` to listBySchool that excludes passwordHash.

describe("listStaff: never returns passwordHash", () => {
  beforeEach(resetDb);

  it("does not include passwordHash on any row, active or invited", async () => {
    const { adminCtx, school } = await createSchoolWithAdmin();
    const invited = await inviteStaff(prisma, adminCtx, {
      name: "Invited Only",
      email: "invited-only@example.test",
      role: "organiser",
    });
    const active = await inviteStaff(prisma, adminCtx, {
      name: "Will Activate",
      email: "will-activate@example.test",
      role: "organiser",
    });
    await activateWithPassword(prisma, school.id, active.id, { password: TEST_PASSWORD });

    const staff = await listStaff(prisma, adminCtx);
    expect(staff.length).toBeGreaterThanOrEqual(3); // admin + invited + active

    for (const row of staff) {
      expect(row).not.toHaveProperty("passwordHash");
    }
    // Sanity: the rows are still otherwise useful (not stripped of everything).
    const invitedRow = staff.find((s) => s.id === invited.id);
    expect(invitedRow?.name).toEqual("Invited Only");
    expect(invitedRow?.status).toEqual("invited");
    const activeRow = staff.find((s) => s.id === active.id);
    expect(activeRow?.status).toEqual("active");
  });

  it("confirms the underlying StaffUser row DOES have a hash, proving this is a projection, not a data issue", async () => {
    const { adminCtx, school } = await createSchoolWithAdmin();
    const staff = await inviteStaff(prisma, adminCtx, {
      name: "Has A Hash",
      email: "has-a-hash@example.test",
      role: "organiser",
    });
    await activateWithPassword(prisma, school.id, staff.id, { password: TEST_PASSWORD });

    const raw = await prisma.staffUser.findUniqueOrThrow({ where: { id: staff.id } });
    expect(raw.passwordHash).not.toBeNull();

    const listed = await listStaff(prisma, adminCtx);
    const listedRow = listed.find((s) => s.id === staff.id);
    expect(listedRow).not.toHaveProperty("passwordHash");
  });
});
