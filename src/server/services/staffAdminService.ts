import type { Db } from "@/server/db";
import { prisma } from "@/server/db";
import { recordAudit } from "@/server/audit/audit";
import { hashPassword } from "@/server/auth/password";
import type { StaffRole } from "@/server/domain";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { requireCapability, type StaffContext } from "@/server/tenancy/context";
import { changeRoleSchema, inviteStaffSchema, setPasswordSchema } from "@/server/validation";
import {
  createStaff,
  deleteStaffScoped,
  findByEmailInSchool,
  findByIdInSchool,
  listBySchool,
  updateStaffScoped,
} from "@/server/repositories/staffRepository";
import { countEventsCreatedBy } from "@/server/repositories/eventRepository";

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

// Hard-deletes a staff user (Requirement 5 of the MVP admin & consent
// enhancements spec) — distinct from deactivateStaff above, which only flips
// status. Rules, in order:
//  1. Cannot delete yourself (mirrors the self-deactivation guard).
//  2. A deactivated account can never be deleted — deletion is only possible
//     from "invited" or "active" status.
//  3. If the user has created any events, the row cannot be removed (no
//     onDelete rule on Event.createdById — deleting would either fail the FK
//     constraint or orphan "created by" attribution). In that case, the
//     account is force-deactivated instead, and the caller is told why via a
//     ConflictError rather than the delete silently doing nothing.
// The audit entry is written BEFORE the row is removed (in the same
// transaction) so it can capture identifying metadata that won't exist to
// look up afterwards, since AuditLog.actorId has no FK — it stays valid, but
// unresolvable to a name, once the StaffUser row is gone.
export async function deleteStaff(db: Db, ctx: StaffContext, staffUserId: string) {
  requireCapability(ctx, "staff.delete");
  if (staffUserId === ctx.staffUserId) {
    throw new ValidationError("You cannot delete your own account.");
  }

  const staff = await findByIdInSchool(db, ctx.schoolId, staffUserId);
  if (!staff) throw new NotFoundError("Staff member not found.");

  if (staff.status === "deactivated") {
    throw new ValidationError("Deactivated accounts cannot be deleted.");
  }

  const eventCount = await countEventsCreatedBy(db, ctx.schoolId, staffUserId);
  if (eventCount > 0) {
    const count = await updateStaffScoped(db, ctx.schoolId, staffUserId, { status: "deactivated" });
    if (count > 0) {
      await recordAudit(db, {
        schoolId: ctx.schoolId,
        actorType: "staff",
        actorId: ctx.staffUserId,
        action: "staff.deactivated",
        entityType: "StaffUser",
        entityId: staffUserId,
        metadata: { reason: "delete_requested_but_has_events", eventCount },
      });
    }
    throw new ConflictError(
      `This user created ${eventCount} event(s) and cannot be deleted. They have been deactivated instead.`,
    );
  }

  await prisma.$transaction(async (txRaw) => {
    const tx = txRaw as unknown as Db;
    // Written before the delete so it can capture identifying details that
    // won't be readable from the StaffUser row afterwards.
    await recordAudit(tx, {
      schoolId: ctx.schoolId,
      actorType: "staff",
      actorId: ctx.staffUserId,
      action: "staff.deleted",
      entityType: "StaffUser",
      entityId: staffUserId,
      metadata: { deletedName: staff.name, deletedEmail: staff.email, deletedRole: staff.role },
    });
    const count = await deleteStaffScoped(tx, ctx.schoolId, staffUserId);
    if (count === 0) throw new NotFoundError("Staff member not found.");
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
