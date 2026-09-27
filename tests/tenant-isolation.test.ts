import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { AppError } from "@/server/errors";
import {
  changeRole,
  deactivateStaff,
  inviteStaff,
  listStaff,
} from "@/server/services/staffAdminService";
import { findByIdInSchool } from "@/server/repositories/staffRepository";
import { createSchoolWithAdmin, resetDb } from "./helpers";

// Tenant isolation (Section 5.4, acceptance criterion 10): a staff actor in
// School A must never read or mutate School B's data, even with a valid ID from
// the other tenant.

describe("tenant isolation", () => {
  beforeEach(resetDb);

  it("listStaff returns only the actor's own school", async () => {
    const a = await createSchoolWithAdmin("School A");
    const b = await createSchoolWithAdmin("School B");

    await inviteStaff(prisma, a.adminCtx, {
      name: "Teacher A",
      email: "teacher.a@example.test",
      role: "organiser",
    });

    const listedByA = await listStaff(prisma, a.adminCtx);
    const schoolIdsA = new Set(listedByA.map((s) => s.schoolId));
    expect(schoolIdsA).toEqual(new Set([a.school.id]));

    const listedByB = await listStaff(prisma, b.adminCtx);
    expect(listedByB.every((s) => s.schoolId === b.school.id)).toBe(true);
    // B's admin must not see A's teacher.
    expect(listedByB.some((s) => s.email === "teacher.a@example.test")).toBe(false);
  });

  it("cannot deactivate a staff member from another school", async () => {
    const a = await createSchoolWithAdmin("School A");
    const b = await createSchoolWithAdmin("School B");

    const teacherB = await inviteStaff(prisma, b.adminCtx, {
      name: "Teacher B",
      email: "teacher.b@example.test",
      role: "organiser",
    });

    // A's admin tries to deactivate B's teacher using B's real ID.
    await expect(deactivateStaff(prisma, a.adminCtx, teacherB.id)).rejects.toBeInstanceOf(AppError);

    // Teacher B must be untouched.
    const stillThere = await findByIdInSchool(prisma, b.school.id, teacherB.id);
    expect(stillThere?.status).toBe("invited");
  });

  it("cannot change the role of a staff member in another school", async () => {
    const a = await createSchoolWithAdmin("School A");
    const b = await createSchoolWithAdmin("School B");
    const teacherB = await inviteStaff(prisma, b.adminCtx, {
      name: "Teacher B",
      email: "teacher.b2@example.test",
      role: "organiser",
    });

    await expect(changeRole(prisma, a.adminCtx, teacherB.id, { role: "admin" })).rejects.toBeInstanceOf(
      AppError,
    );

    const unchanged = await findByIdInSchool(prisma, b.school.id, teacherB.id);
    expect(unchanged?.role).toBe("organiser");
  });

  it("same email may exist independently in two schools", async () => {
    const a = await createSchoolWithAdmin("School A");
    const b = await createSchoolWithAdmin("School B");
    const shared = "shared@example.test";

    const inA = await inviteStaff(prisma, a.adminCtx, { name: "X", email: shared, role: "organiser" });
    const inB = await inviteStaff(prisma, b.adminCtx, { name: "Y", email: shared, role: "organiser" });

    expect(inA.id).not.toEqual(inB.id);
    expect(inA.schoolId).toEqual(a.school.id);
    expect(inB.schoolId).toEqual(b.school.id);
  });
});
