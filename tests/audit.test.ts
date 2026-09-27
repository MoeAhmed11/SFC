import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { recordAudit } from "@/server/audit/audit";
import { login } from "@/server/services/authService";
import { changeRole, deactivateStaff, inviteStaff } from "@/server/services/staffAdminService";
import { createSchoolWithAdmin, resetDb, TEST_PASSWORD } from "./helpers";

// Audit logging (Section 7 FR-01, acceptance criterion 11). Important actions
// must be recorded, scoped to the school, and free of sensitive data.

describe("audit logging", () => {
  beforeEach(resetDb);

  it("records login, invite, role change, and deactivation", async () => {
    const { school, admin, adminCtx } = await createSchoolWithAdmin();

    await login(prisma, school.id, { email: admin.email, password: TEST_PASSWORD });
    const invited = await inviteStaff(prisma, adminCtx, {
      name: "T",
      email: "t@example.test",
      role: "organiser",
    });
    await changeRole(prisma, adminCtx, invited.id, { role: "admin" });
    await deactivateStaff(prisma, adminCtx, invited.id);

    const logs = await prisma.auditLog.findMany({ where: { schoolId: school.id } });
    const actions = logs.map((l) => l.action);
    // "staff.activated" also present from the admin bootstrap in the helper.
    expect(actions).toContain("staff.login");
    expect(actions).toContain("staff.invited");
    expect(actions).toContain("staff.role_changed");
    expect(actions).toContain("staff.deactivated");

    // All entries are scoped to this school.
    expect(logs.every((l) => l.schoolId === school.id)).toBe(true);
  });

  it("strips forbidden sensitive keys from metadata", async () => {
    const { school } = await createSchoolWithAdmin();
    await recordAudit(prisma, {
      schoolId: school.id,
      actorType: "staff",
      action: "test.sensitive",
      metadata: {
        role: "admin",
        password: "should-not-persist",
        token_hash: "should-not-persist",
        secret: "should-not-persist",
      },
    });

    const entry = await prisma.auditLog.findFirst({
      where: { schoolId: school.id, action: "test.sensitive" },
    });
    expect(entry).not.toBeNull();
    const meta = JSON.parse(entry!.metadata) as Record<string, unknown>;
    expect(meta.role).toBe("admin");
    expect(meta.password).toBeUndefined();
    expect(meta.token_hash).toBeUndefined();
    expect(meta.secret).toBeUndefined();
  });
});
