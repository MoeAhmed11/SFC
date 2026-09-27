"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db";
import { submitConsent } from "@/server/services/consentService";
import { AppError } from "@/server/errors";

export interface ConsentFormState {
  error?: string;
  success?: boolean;
}

// Server Action backing the parent consent form. The token comes from the
// page's URL segment, bound via .bind() when rendering the form — never taken
// from the form body, so it can't be tampered with client-side.
export async function submitConsentAction(
  token: string,
  _prevState: ConsentFormState,
  formData: FormData,
): Promise<ConsentFormState> {
  const response = String(formData.get("response") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();

  if (response !== "granted" && response !== "declined") {
    return { error: "Please choose whether you grant or decline consent." };
  }

  try {
    await submitConsent(prisma, token, { response, notes: notes || undefined });
  } catch (err) {
    if (err instanceof AppError) {
      return { error: err.message };
    }
    return { error: "Something went wrong. Please try again." };
  }

  revalidatePath(`/c/${token}`);
  return { success: true };
}
