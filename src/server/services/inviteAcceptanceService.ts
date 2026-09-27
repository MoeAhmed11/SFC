import type { Db } from "@/server/db";
import { recordAudit } from "@/server/audit/audit";
import { hashPassword } from "@/server/auth/password";
import { UnauthenticatedError, ValidationError } from "@/server/errors";
import { setPasswordSchema } from "@/server/validation";
import { consumeInviteToken, peekInviteToken } from "@/server/services/inviteTokenService";
import { findByIdInSchool, updateStaffScoped } from "@/server/repositories/staffRepository";

// The HTTP-safe counterpart to staffAdminService.activateWithPassword. Takes
// ONLY a raw invite token and a new password — never a bare staffUserId — so
// the token itself is the sole source of authority (same design as the parent
// consent flow: identity comes from the token, not from anything else in the
// request). The token is validated and consumed atomically; a token that is
// unknown, expired, or already used produces the same generic failure.

export interface InvitePreview {
  staffName: string;
  staffEmail: string;
  schoolName: string;
}

// Resolves a raw invite token to a safe preview WITHOUT consuming it, so the
// acceptance page can render who is being activated before the form is
// submitted. Throws a single generic error for any invalid/expired/used token.
export async function getInvitePreview(db: Db, rawToken: string): Promise<InvitePreview> {
  const binding = await peekInviteToken(db, rawToken);
  if (!binding) throw invalidInvite();

  const staff = await findByIdInSchool(db, binding.schoolId, binding.staffUserId);
  if (!staff) throw invalidInvite();
  const school = await db.school.findUnique({ where: { id: binding.schoolId } });
  if (!school) throw invalidInvite();

  if (staff.status !== "invited") {
    // Already activated or deactivated since the link was issued.
    throw invalidInvite();
  }

  return { staffName: staff.name, staffEmail: staff.email, schoolName: school.name };
}

// Consumes the token (single use) and activates the account with the chosen
// password. Any failure after consumption still leaves the token spent —
// deliberately, so a token can't be retried indefinitely if something else
// about the account is wrong (e.g. deactivated in the meantime).
export async function acceptInvite(
  db: Db,
  rawToken: string,
  input: { password: string },
): Promise<void> {
  // Validate the password shape BEFORE consuming the token, so a client-side
  // mistake (e.g. too short) doesn't burn the one-time link.
  const parsed = setPasswordSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError("Password does not meet requirements.");

  const binding = await consumeInviteToken(db, rawToken);
  if (!binding) throw invalidInvite();

  const staff = await findByIdInSchool(db, binding.schoolId, binding.staffUserId);
  if (!staff || staff.status !== "invited") throw invalidInvite();

  const passwordHash = await hashPassword(parsed.data.password);
  const count = await updateStaffScoped(db, binding.schoolId, binding.staffUserId, {
    status: "active",
    passwordHash,
  });
  if (count === 0) throw invalidInvite();

  await recordAudit(db, {
    schoolId: binding.schoolId,
    actorType: "staff",
    actorId: binding.staffUserId,
    action: "staff.invite_accepted",
    entityType: "StaffUser",
    entityId: binding.staffUserId,
  });
}

function invalidInvite() {
  return new UnauthenticatedError("This invite link is invalid, expired, or has already been used.");
}
