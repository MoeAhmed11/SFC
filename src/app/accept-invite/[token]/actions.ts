"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { acceptInvite } from "@/server/services/inviteAcceptanceService";
import { AppError } from "@/server/errors";

export interface AcceptInviteFormState {
  error?: string;
}

export async function acceptInviteAction(
  token: string,
  _prevState: AcceptInviteFormState,
  formData: FormData,
): Promise<AcceptInviteFormState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  if (!password) {
    return { error: "Choose a password." };
  }
  if (password !== confirm) {
    return { error: "Passwords do not match." };
  }

  try {
    await acceptInvite(prisma, token, { password });
  } catch (err) {
    if (err instanceof AppError) return { error: err.message };
    return { error: "Something went wrong. Please try again." };
  }

  redirect("/login");
}
