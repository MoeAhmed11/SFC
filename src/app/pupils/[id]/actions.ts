"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db";
import { requireStaffContext } from "@/server/http/session";
import { archivePupil, updatePupil } from "@/server/services/dataService";
import { resendConsentLink } from "@/server/services/consentResendService";
import { AppError } from "@/server/errors";
import type { PupilStatus } from "@/server/domain";

export interface PupilActionState {
  error?: string;
  success?: string;
}

export async function updatePupilAction(
  pupilId: string,
  _prevState: PupilActionState,
  formData: FormData,
): Promise<PupilActionState> {
  const ctx = await requireStaffContext();

  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const classGroupId = String(formData.get("classGroupId") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim() as PupilStatus | "";

  if (!firstName || !lastName) {
    return { error: "First name and last name are required." };
  }

  try {
    await updatePupil(prisma, ctx, pupilId, {
      firstName,
      lastName,
      classGroupId: classGroupId || null,
      status: status || undefined,
    });
  } catch (err) {
    if (err instanceof AppError) return { error: err.message };
    return { error: "Something went wrong. Please try again." };
  }
  revalidatePath(`/pupils/${pupilId}`);
  return { success: "Pupil updated." };
}

export async function archivePupilAction(
  pupilId: string,
  _prevState: PupilActionState,
  _formData: FormData,
): Promise<PupilActionState> {
  const ctx = await requireStaffContext();
  try {
    await archivePupil(prisma, ctx, pupilId);
  } catch (err) {
    if (err instanceof AppError) return { error: err.message };
    return { error: "Something went wrong. Please try again." };
  }
  revalidatePath(`/pupils/${pupilId}`);
  revalidatePath("/pupils");
  return { success: "Pupil archived." };
}

export async function resendConsentLinkAction(
  pupilId: string,
  eventId: string,
  guardianId: string,
  _prevState: PupilActionState,
  _formData: FormData,
): Promise<PupilActionState> {
  const ctx = await requireStaffContext();
  try {
    const result = await resendConsentLink(prisma, ctx, { eventId, pupilId, guardianId });
    if (!result.sent) {
      return {
        error:
          "The link was created, but the email could not be sent. Please try again or contact the school's admin.",
      };
    }
  } catch (err) {
    if (err instanceof AppError) return { error: err.message };
    return { error: "Something went wrong. Please try again." };
  }
  revalidatePath(`/pupils/${pupilId}`);
  return { success: "A new consent link has been sent to the guardian." };
}
