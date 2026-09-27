"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { loginByEmail } from "@/server/services/authService";
import { setSessionCookie } from "@/server/http/session";
import { AppError } from "@/server/errors";

export interface LoginFormState {
  error?: string;
}

// Server Action backing the login form (progressive-enhancement friendly —
// works without client-side JavaScript, per the accessibility checklist).
export async function loginAction(
  _prevState: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  try {
    const result = await loginByEmail(prisma, { email, password });
    await setSessionCookie(result.token);
  } catch (err) {
    if (err instanceof AppError) {
      return { error: err.message };
    }
    return { error: "Something went wrong. Please try again." };
  }

  redirect("/events");
}
