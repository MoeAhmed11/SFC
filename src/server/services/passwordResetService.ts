import type { Db } from "@/server/db";
import { prisma } from "@/server/db";
import { recordAudit } from "@/server/audit/audit";
import { hashPassword } from "@/server/auth/password";
import { NotFoundError, UnauthenticatedError, ValidationError } from "@/server/errors";
import { requireCapability, type StaffContext } from "@/server/tenancy/context";
import { emailSchema, setPasswordSchema } from "@/server/validation";
import {
  consumePasswordResetToken,
  issuePasswordResetToken,
} from "@/server/services/passwordResetTokenService";
import { createEmailProvider } from "@/server/notifications/EmailProviderConfig";
import { buildPasswordResetEmail } from "@/server/notifications/templates";
import { makeDateFormatter } from "@/server/notifications/format";
import {
  findActiveByEmailAcrossSchools,
  findByIdInSchool,
  updateStaffScoped,
} from "@/server/repositories/staffRepository";
import { findSchoolById } from "@/server/repositories/schoolRepository";
import { revokeAllSessionsForStaff } from "@/server/repositories/sessionRepository";

// Password reset (Requirement 7 of the MVP admin & consent enhancements
// spec): an admin-triggered path (sendPasswordResetForStaff) and a self-serve
// "forgot password" path (requestPasswordReset), both producing an identical
// PasswordResetToken and sharing the one consuming flow (resetPassword)
// below. Neither issuance path is distinguishable from the outside — the
// email content is the same either way (buildPasswordResetEmail), and the
// self-serve path never reveals whether a given email matched an account.

function resetLinkBase(): string {
  return process.env.APP_BASE_URL
    ? `${process.env.APP_BASE_URL}/reset-password`
    : "http://localhost:3000/reset-password";
}

export interface SendPasswordResetResult {
  sent: boolean;
  // Present only when sent is false — short, non-sensitive reason for logs/audit.
  error?: string;
}

// Issues a token for the given staff row and emails it. Shared by both
// issuance paths below — never throws on a transient provider failure
// (mirrors sendStaffInviteEmail/consentResendService's pattern), since the
// token has already been created by the time the send is attempted.
async function issueAndSendResetEmail(
  db: Db,
  staff: { id: string; schoolId: string; email: string },
  school: { name: string; timezone: string },
): Promise<SendPasswordResetResult> {
  const issued = await issuePasswordResetToken(db, staff.schoolId, staff.id);
  const resetUrl = `${resetLinkBase()}/${issued.raw}`;

  try {
    const provider = createEmailProvider();
    const message = buildPasswordResetEmail(staff.email, {
      schoolName: school.name,
      resetUrl,
      expiresAt: issued.expiresAt,
      formatDate: makeDateFormatter(school.timezone),
    });
    await provider.send(message);
    return { sent: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown_error";
    console.error("[passwordResetService] failed to send reset email:", message);
    return { sent: false, error: message };
  }
}

// Admin sends a reset link to another staff member (any role). Only for
// "active" accounts — an invited account should use its invite link instead,
// and a deactivated account shouldn't be reachable at all.
export async function sendPasswordResetForStaff(
  db: Db,
  ctx: StaffContext,
  staffUserId: string,
): Promise<SendPasswordResetResult> {
  requireCapability(ctx, "staff.reset_password");

  const staff = await findByIdInSchool(db, ctx.schoolId, staffUserId);
  if (!staff || staff.status !== "active") throw new NotFoundError("Staff member not found.");

  const school = await findSchoolById(db, ctx.schoolId);
  if (!school) throw new NotFoundError("School not found.");

  const result = await issueAndSendResetEmail(db, staff, school);

  await recordAudit(db, {
    schoolId: ctx.schoolId,
    actorType: "staff",
    actorId: ctx.staffUserId,
    action: "staff.password_reset_sent",
    entityType: "StaffUser",
    entityId: staffUserId,
    metadata: { emailSent: result.sent },
  });

  return result;
}

// Self-serve "forgot password" (unauthenticated — no StaffContext). Staff
// email is unique PER SCHOOL, not globally (Section 3.1), so this resolves
// active accounts across ALL schools sharing that email, exactly like
// loginByEmail's tenant resolution. Deliberately returns void, not a result —
// the caller MUST show the same generic confirmation message regardless of
// whether any account matched, to prevent account enumeration (Requirement
// 7.2). An invalid email shape is treated the same as "no match": silently
// does nothing rather than surfacing a validation error, for the same reason.
export async function requestPasswordReset(db: Db, email: string): Promise<void> {
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) return;

  const matches = await findActiveByEmailAcrossSchools(db, parsed.data);
  for (const staff of matches) {
    const school = await findSchoolById(db, staff.schoolId);
    if (!school) continue;
    const result = await issueAndSendResetEmail(db, staff, school);
    await recordAudit(db, {
      schoolId: staff.schoolId,
      actorType: "system",
      actorId: null,
      action: "staff.password_reset_requested",
      entityType: "StaffUser",
      entityId: staff.id,
      metadata: { emailSent: result.sent },
    });
  }
}

// Consumes a reset token (either issuance path) and sets a new password.
// Sessions are revoked ONLY here, once the new password is actually in place
// (Requirement 7.4) — never merely by issuing/sending a link, so a user isn't
// logged out just because a reset was requested (including by someone else).
export async function resetPassword(
  db: Db,
  rawToken: string,
  input: { password: string },
): Promise<void> {
  // Validate the password shape BEFORE consuming the token, so a mistaken
  // first attempt doesn't burn the one-time link (mirrors acceptInvite).
  const parsed = setPasswordSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError("Password does not meet requirements.");

  const binding = await consumePasswordResetToken(db, rawToken);
  if (!binding) throw invalidResetLink();

  const staff = await findByIdInSchool(db, binding.schoolId, binding.staffUserId);
  // A deactivated account (e.g. deactivated after the link was issued) must
  // not be reactivatable via a stale reset link.
  if (!staff || staff.status !== "active") throw invalidResetLink();

  const passwordHash = await hashPassword(parsed.data.password);

  await prisma.$transaction(async (txRaw) => {
    const tx = txRaw as unknown as Db;
    const count = await updateStaffScoped(tx, binding.schoolId, binding.staffUserId, { passwordHash });
    if (count === 0) throw invalidResetLink();
    await revokeAllSessionsForStaff(tx, binding.staffUserId);
    await recordAudit(tx, {
      schoolId: binding.schoolId,
      actorType: "staff",
      actorId: binding.staffUserId,
      action: "staff.password_reset",
      entityType: "StaffUser",
      entityId: binding.staffUserId,
    });
  });
}

function invalidResetLink() {
  return new UnauthenticatedError("This link is invalid, expired, or has already been used.");
}
