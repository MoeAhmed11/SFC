"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db";
import { requirePlatformContext } from "@/server/http/platformSession";
import { createAdminForSchool, createSchoolWithFirstAdmin } from "@/server/services/platformAdminService";
import { isSchoolType } from "@/server/domain";
import { AppError } from "@/server/errors";

export interface PlatformFormState {
  error?: string;
  success?: string;
}

export async function createSchoolAction(
  _prevState: PlatformFormState,
  formData: FormData,
): Promise<PlatformFormState> {
  const ctx = await requirePlatformContext();
  const name = String(formData.get("name") ?? "").trim();
  const schoolType = String(formData.get("schoolType") ?? "");
  const adminName = String(formData.get("adminName") ?? "").trim();
  const adminEmail = String(formData.get("adminEmail") ?? "").trim();
  const adminPassword = String(formData.get("adminPassword") ?? "");

  if (!name || !isSchoolType(schoolType) || !adminName || !adminEmail || !adminPassword) {
    return { error: "School name, type, and admin name/email/password are all required." };
  }

  try {
    const result = await createSchoolWithFirstAdmin(prisma, ctx, {
      name,
      schoolType,
      adminName,
      adminEmail,
      adminPassword,
    });
    revalidatePath("/platform");
    return { success: `Created "${result.school.name}" with admin ${result.admin.email}.` };
  } catch (err) {
    if (err instanceof AppError) return { error: err.message };
    return { error: "Something went wrong. Please try again." };
  }
}

export async function createAdminAction(
  schoolId: string,
  _prevState: PlatformFormState,
  formData: FormData,
): Promise<PlatformFormState> {
  const ctx = await requirePlatformContext();
  const adminName = String(formData.get("adminName") ?? "").trim();
  const adminEmail = String(formData.get("adminEmail") ?? "").trim();
  const adminPassword = String(formData.get("adminPassword") ?? "");

  if (!adminName || !adminEmail || !adminPassword) {
    return { error: "Admin name, email, and password are all required." };
  }

  try {
    const admin = await createAdminForSchool(prisma, ctx, schoolId, {
      adminName,
      adminEmail,
      adminPassword,
    });
    revalidatePath(`/platform/schools/${schoolId}`);
    return { success: `Created and activated admin ${admin.email}.` };
  } catch (err) {
    if (err instanceof AppError) return { error: err.message };
    return { error: "Something went wrong. Please try again." };
  }
}
