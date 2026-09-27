"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db";
import { requireStaffContext } from "@/server/http/session";
import { changeRole, deactivateStaff, inviteStaff } from "@/server/services/staffAdminService";
import { issueInviteToken } from "@/server/services/inviteTokenService";
import { isStaffRole } from "@/server/domain";
import { AppError } from "@/server/errors";

export interface StaffFormState {
  error?: string;
  inviteUrl?: string;
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
  try {
    const staff = await inviteStaff(prisma, ctx, { name, email, role });
    // No real email provider exists yet (Section 18.3) — surface the invite
    // link directly so an admin can send it manually in the meantime.
    const issued = await issueInviteToken(prisma, ctx.schoolId, staff.id);
    inviteUrl = `${inviteLinkBase()}/${issued.raw}`;
  } catch (err) {
    if (err instanceof AppError) return { error: err.message };
    return { error: "Something went wrong. Please try again." };
  }
  revalidatePath("/staff");
  return { inviteUrl };
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
