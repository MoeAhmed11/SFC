"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db";
import { requireStaffContext } from "@/server/http/session";
import { updateSchoolSettings } from "@/server/services/schoolSettingsService";
import { AppError } from "@/server/errors";

export interface SettingsFormState {
  error?: string;
  success?: string;
}

// Admin-only update of school policy flags (decisions 17.3-17.5, 17.9).
// updateSchoolSettings itself enforces the school.manage_settings capability
// and audits the change — this action is a thin form-binding wrapper over it,
// mirroring the pattern in src/app/staff/actions.ts.
export async function updateSettingsAction(
  _prevState: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const ctx = await requireStaffContext();

  // Unchecked checkboxes are absent from FormData, so .get() returns null
  // and this correctly resolves to false.
  const allowConsentEditing = formData.get("allowConsentEditing") === "on";
  const allowLateConsent = formData.get("allowLateConsent") === "on";
  const allowOfflineConsent = formData.get("allowOfflineConsent") === "on";
  const dataRetentionYears = Number(formData.get("dataRetentionYears"));

  try {
    await updateSchoolSettings(prisma, ctx, {
      allowConsentEditing,
      allowLateConsent,
      allowOfflineConsent,
      dataRetentionYears,
    });
  } catch (err) {
    if (err instanceof AppError) return { error: err.message };
    return { error: "Something went wrong. Please try again." };
  }
  revalidatePath("/settings");
  return { success: "Settings updated." };
}
