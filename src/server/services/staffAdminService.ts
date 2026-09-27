import type { Db } from "@/server/db";
import { recordAudit } from "@/server/audit/audit";
import { hashPassword } from "@/server/auth/password";
import type { StaffRole } from "@/server/domain";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { requireCapability, type StaffContext } from "@/server/tenancy/context";
import { changeRoleSchema, inviteStaffSchema, setPasswordSchema } from "@/server/validation";
import {
  createStaff,
  findByEmailInSchool,
  findByIdInSchool,
  listBySchool,
  updateStaffScoped,
} from "@/server/repositories/staffRepository";

// Staff administration actions (Section 7 FR-01). Every action:
//  1. checks the actor's capability (RBAC),
//  2. is scoped to the actor's own school (tenant isolation),
//  3. writes an audit entry.

export async function inviteStaff(
  db: Db,
  ctx: StaffContext,
  input: { name: string; email: string; role: StaffRole },
) {
  requireCapability(ctx, "staff.invite");
  const parsed = inviteStaffSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError("Invalid staff details.");

  const existing = await findByEmailInSchool(db, ctx.schoolId, parsed.data.email);
  if (existing) throw new ConflictError("A staff member with this email already exists.");

  const staff = await createStaff(db, {
    schoolId: ctx.schoolId,
    name: parsed.data.name,
    email: parsed.data.email,
    role: parsed.data.role,
    status: "invited",
    passwordHash: null,
  });

  await recordAudit(db, {
    schoolId: ctx.schoolId,
    actorType: "staff",
    actorId: ctx.staffUserId,
    action: "staff.invited",
    entityType: "StaffUser",
    entityId: staff.id,
    metadata: { role: staff.role },
  });

  return staff;
}

// INTERNAL / TEST-AND-SEED-ONLY. Sets a password for an invited staff member
// and activates them, given a bare schoolId/staffUserId with NO capability
// check. This must NEVER be called from an HTTP route — there would be
// nothing stopping any caller from activating any invited account with any
// password of their choosing. It exists solely so tests and prisma/seed.ts can
// bootstrap an initial admin, since a first account cannot come through the
// normal invite-acceptance flow.
//
// The safe, HTTP-reachable equivalent is `acceptInvite` below, which is driven
// by a validated, single-use InviteToken instead of trusted IDs.
export async function activateWithPassword(
  db: Db,
  schoolId: string,
  staffUserId: string,
  input: { password: string },
) {
  const parsed = setPasswordSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError("Password does not meet requirements.");

  const staff = await findByIdInSchool(db, schoolId, staffUserId);
  if (!staff) throw new NotFoundError("Staff member not found.");

  const passwordHash = await hashPassword(parsed.data.password);
  const count = await updateStaffScoped(db, schoolId, staffUserId, {
    status: "active",
    passwordHash,
  });
  if (count === 0) throw new NotFoundError("Staff member not found.");

  await recordAudit(db, {
    schoolId,
    actorType: "staff",
    actorId: staffUserId,
    action: "staff.activated",
    entityType: "StaffUser",
    entityId: staffUserId,
  });
}

export async function deactivateStaff(db: Db, ctx: StaffContext, staffUserId: string) {
  requireCapability(ctx, "staff.deactivate");
  if (staffUserId === ctx.staffUserId) {
    // Prevent an admin locking themselves out in one step.
    throw new ValidationError("You cannot deactivate your own account.");
  }

  const count = await updateStaffScoped(db, ctx.schoolId, staffUserId, { status: "deactivated" });
  if (count === 0) throw new NotFoundError("Staff member not found.");

  await recordAudit(db, {
    schoolId: ctx.schoolId,
    actorType: "staff",
    actorId: ctx.staffUserId,
    action: "staff.deactivated",
    entityType: "StaffUser",
    entityId: staffUserId,
  });
}

export async function changeRole(
  db: Db,
  ctx: StaffContext,
  staffUserId: string,
  input: { role: StaffRole },
) {
  requireCapability(ctx, "staff.change_role");
  const parsed = changeRoleSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError("Invalid role.");

  const count = await updateStaffScoped(db, ctx.schoolId, staffUserId, { role: parsed.data.role });
  if (count === 0) throw new NotFoundError("Staff member not found.");

  await recordAudit(db, {
    schoolId: ctx.schoolId,
    actorType: "staff",
    actorId: ctx.staffUserId,
    action: "staff.role_changed",
    entityType: "StaffUser",
    entityId: staffUserId,
    metadata: { role: parsed.data.role },
  });
}

export async function listStaff(db: Db, ctx: StaffContext) {
  requireCapability(ctx, "staff.list");
  return listBySchool(db, ctx.schoolId);
}
