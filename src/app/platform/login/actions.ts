"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { platformLogin } from "@/server/services/platformAuthService";
import { setPlatformSessionCookie } from "@/server/http/platformSession";
import { AppError } from "@/server/errors";

export interface PlatformLoginFormState {
  error?: string;
}

// Server Action backing the platform login form. Mirrors src/app/login/actions.ts.
export async function platformLoginAction(
  _prevState: PlatformLoginFormState,
  formData: FormData,
): Promise<PlatformLoginFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  try {
    const result = await platformLogin(prisma, { email, password });
    await setPlatformSessionCookie(result.token);
  } catch (err) {
    if (err instanceof AppError) {
      return { error: err.message };
    }
    return { error: "Something went wrong. Please try again." };
  }

  redirect("/platform");
}
