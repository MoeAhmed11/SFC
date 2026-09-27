import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { ForbiddenError } from "@/server/errors";
import { roleHasCapability } from "@/server/domain";
import {
  changeRole,
  deactivateStaff,
  inviteStaff,
  listStaff,
} from "@/server/services/staffAdminService";
import { createSchoolWithAdmin, ctxFor, resetDb } from "./helpers";

// Role-based access control (Section 5.1/5.2, acceptance criterion — role
// permissions). Organisers manage events but cannot administer staff.

describe("RBAC capability matrix", () => {
  it("admin has staff administration capabilities", () => {
    expect(roleHasCapability("admin", "staff.invite")).toBe(true);
    expect(roleHasCapability("admin", "staff.deactivate")).toBe(true);
    expect(roleHasCapability("admin", "staff.change_role")).toBe(true);
    expect(roleHasCapability("admin", "event.manage")).toBe(true);
  });

  it("organiser cannot administer staff but can manage events", () => {
    expect(roleHasCapability("organiser", "staff.invite")).toBe(false);
    expect(roleHasCapability("organiser", "staff.deactivate")).toBe(false);
    expect(roleHasCapability("organiser", "staff.change_role")).toBe(false);
    expect(roleHasCapability("organiser", "staff.list")).toBe(false);
    expect(roleHasCapability("organiser", "event.manage")).toBe(true);
    expect(roleHasCapability("organiser", "event.view")).toBe(true);
  });
});

describe("RBAC enforcement in staff admin service", () => {
  beforeEach(resetDb);

  it("organiser is forbidden from inviting staff", async () => {
    const { school } = await createSchoolWithAdmin();
    const organiserCtx = ctxFor(school.id, "organiser-1", "organiser");

    await expect(
      inviteStaff(prisma, organiserCtx, { name: "New", email: "new@example.test", role: "organiser" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("organiser is forbidden from deactivating, listing, and changing roles", async () => {
    const { school, admin } = await createSchoolWithAdmin();
    const organiserCtx = ctxFor(school.id, "organiser-1", "organiser");

    await expect(deactivateStaff(prisma, organiserCtx, admin.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listStaff(prisma, organiserCtx)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(changeRole(prisma, organiserCtx, admin.id, { role: "admin" })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("admin can perform staff administration within their school", async () => {
    const { adminCtx } = await createSchoolWithAdmin();
    const invited = await inviteStaff(prisma, adminCtx, {
      name: "Teacher",
      email: "teacher@example.test",
      role: "organiser",
    });
    expect(invited.status).toBe("invited");

    await changeRole(prisma, adminCtx, invited.id, { role: "admin" });
    await deactivateStaff(prisma, adminCtx, invited.id);

    const staff = await listStaff(prisma, adminCtx);
    const updated = staff.find((s) => s.id === invited.id);
    expect(updated?.role).toBe("admin");
    expect(updated?.status).toBe("deactivated");
  });

  it("admin cannot deactivate their own account", async () => {
    const { adminCtx } = await createSchoolWithAdmin();
    await expect(deactivateStaff(prisma, adminCtx, adminCtx.staffUserId)).rejects.toThrowError(
      /your own account/i,
    );
  });
});
