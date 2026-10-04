import type { NextRequest } from "next/server";
import { prisma } from "@/server/db";
import { requirePlatformContext } from "@/server/http/platformSession";
import { errorResponse, jsonOk } from "@/server/http/respond";
import { createSchoolWithFirstAdmin, listSchoolsWithUsage } from "@/server/services/platformAdminService";
import { ValidationError } from "@/server/errors";

export async function GET() {
  try {
    const ctx = await requirePlatformContext();
    const rows = await listSchoolsWithUsage(prisma, ctx);
    return jsonOk({ schools: rows });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requirePlatformContext();
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      throw new ValidationError("Invalid request body.");
    }
    // createSchoolWithFirstAdmin validates the shape via Zod internally; the
    // route only needs to pass the parsed JSON body through.
    const input = body as Parameters<typeof createSchoolWithFirstAdmin>[2];
    const result = await createSchoolWithFirstAdmin(prisma, ctx, input);
    return jsonOk({ school: result.school, admin: { id: result.admin.id, email: result.admin.email } }, 201);
  } catch (err) {
    return errorResponse(err);
  }
}
