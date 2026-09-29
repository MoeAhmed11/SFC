"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { resetPassword } from "@/server/services/passwordResetService";
import { AppError } from "@/server/errors";

export interface ResetPasswordFormState {
  error?: string;
}

export async function resetPasswordAction(
  token: string,
  _prevState: ResetPasswordFormState,
  formData: FormData,
): Promise<ResetPasswordFormState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  if (!password) {
    return { error: "Choose a new password." };
  }
  if (password !== confirm) {
    return { error: "Passwords do not match." };
  }

  try {
    await resetPassword(prisma, token, { password });
  } catch (err) {
    if (err instanceof AppError) return { error: err.message };
    return { error: "Something went wrong. Please try again." };
  }

  redirect("/login");
}
