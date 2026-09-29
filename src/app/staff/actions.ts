"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db";
import { requireStaffContext } from "@/server/http/session";
import { changeRole, deactivateStaff, deleteStaff, inviteStaff } from "@/server/services/staffAdminService";
import { issueInviteToken } from "@/server/services/inviteTokenService";
import { sendStaffInviteEmail } from "@/server/services/staffInviteEmailService";
import { sendPasswordResetForStaff } from "@/server/services/passwordResetService";
import { findSchoolById } from "@/server/repositories/schoolRepository";
import { isStaffRole } from "@/server/domain";
import { AppError } from "@/server/errors";

export interface StaffFormState {
  error?: string;
  inviteUrl?: string;
  emailSent?: boolean;
  success?: string;
}

function inviteLinkBase(): string {
  return process.env.APP_BASE_URL
    ? `${process.env.APP_BASE_URL}/accept-invite`
    : "http://localhost:3000/accept-invite";
}

export async function inviteStaffAction(
  _prevState: StaffFormState,
  formData: FormData,
): Promise<StaffFormState> {
  const ctx = await requireStaffContext();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const role = String(formData.get("role") ?? "");

  if (!name || !email || !isStaffRole(role)) {
    return { error: "Name, email, and a valid role are required." };
  }

  let inviteUrl: string;
  let emailSent: boolean;
  try {
    const staff = await inviteStaff(prisma, ctx, { name, email, role });
    const issued = await issueInviteToken(prisma, ctx.schoolId, staff.id);
    inviteUrl = `${inviteLinkBase()}/${issued.raw}`;

    // Email it via the configured EmailProvider. The link above is still
    // returned regardless of outcome, so an admin can copy-paste it as a
    // fallback if the send fails (Section 18.3 residual gap).
    const school = await findSchoolById(prisma, ctx.schoolId);
    const result = await sendStaffInviteEmail({
      to: staff.email,
      schoolName: school?.name ?? "Your school",
      schoolTimezone: school?.timezone ?? "Europe/London",
      inviteUrl,
      expiresAt: issued.expiresAt,
    });
    emailSent = result.sent;
  } catch (err) {
    if (err instanceof AppError) return { error: err.message };
    return { error: "Something went wrong. Please try again." };
  }
  revalidatePath("/staff");
  return { inviteUrl, emailSent };
}

export async function changeRoleAction(
  staffId: string,
  _prevState: StaffFormState,
  formData: FormData,
): Promise<StaffFormState> {
  const ctx = await requireStaffContext();
  const role = String(formData.get("role") ?? "");
  if (!isStaffRole(role)) return { error: "Invalid role." };
  try {
    await changeRole(prisma, ctx, staffId, { role });
  } catch (err) {
    if (err instanceof AppError) return { error: err.message };
    return { error: "Something went wrong. Please try again." };
  }
  revalidatePath("/staff");
  return {};
}

export async function deactivateStaffAction(
  staffId: string,
  _prevState: StaffFormState,
  _formData: FormData,
): Promise<StaffFormState> {
  const ctx = await requireStaffContext();
  try {
    await deactivateStaff(prisma, ctx, staffId);
  } catch (err) {
    if (err instanceof AppError) return { error: err.message };
    return { error: "Something went wrong. Please try again." };
  }
  revalidatePath("/staff");
  return {};
}

// Hard-deletes a staff account (Requirement 5 of the MVP admin & consent
// enhancements spec) — distinct from deactivateStaffAction above. deleteStaff
// itself force-deactivates and throws a ConflictError (with an explanatory
// message) if the account has created any events, so that message is
// surfaced here rather than a generic failure.
export async function deleteStaffAction(
  staffId: string,
  _prevState: StaffFormState,
  _formData: FormData,
): Promise<StaffFormState> {
  const ctx = await requireStaffContext();
  try {
    await deleteStaff(prisma, ctx, staffId);
  } catch (err) {
    if (err instanceof AppError) return { error: err.message };
    return { error: "Something went wrong. Please try again." };
  }
  revalidatePath("/staff");
  return {};
}

// Admin-triggered password reset link for another staff member (Requirement
// 7 of the MVP admin & consent enhancements spec, part 2). Admin-only —
// sendPasswordResetForStaff checks staff.reset_password internally.
export async function sendPasswordResetAction(
  staffId: string,
  _prevState: StaffFormState,
  _formData: FormData,
): Promise<StaffFormState> {
  const ctx = await requireStaffContext();
  try {
    const result = await sendPasswordResetForStaff(prisma, ctx, staffId);
    if (!result.sent) {
      return { error: "The reset link was created, but the email could not be sent. Please try again." };
    }
  } catch (err) {
    if (err instanceof AppError) return { error: err.message };
    return { error: "Something went wrong. Please try again." };
  }
  return { success: "A password reset link has been sent." };
}
