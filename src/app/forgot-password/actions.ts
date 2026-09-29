"use server";

import { prisma } from "@/server/db";
import { requestPasswordReset } from "@/server/services/passwordResetService";

export interface ForgotPasswordFormState {
  submitted?: boolean;
}

// Always returns the same result regardless of whether the email matched an
// account (Requirement 7.2) — this is deliberate, not an oversight: the page
// shows one generic confirmation message either way, so the response itself
// carries no signal about whether an account exists for that email.
export async function requestPasswordResetAction(
  _prevState: ForgotPasswordFormState,
  formData: FormData,
): Promise<ForgotPasswordFormState> {
  const email = String(formData.get("email") ?? "").trim();
  if (email) {
    await requestPasswordReset(prisma, email);
  }
  return { submitted: true };
}
