import type { NextRequest } from "next/server";
import { prisma } from "@/server/db";
import { requirePlatformContext } from "@/server/http/platformSession";
import { errorResponse, jsonOk } from "@/server/http/respond";
import { createAdminForSchool } from "@/server/services/platformAdminService";
import { ValidationError } from "@/server/errors";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requirePlatformContext();
    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      throw new ValidationError("Invalid request body.");
    }
    // createAdminForSchool validates the shape via Zod internally; the route
    // only needs to pass the parsed JSON body through.
    const input = body as Parameters<typeof createAdminForSchool>[3];
    const admin = await createAdminForSchool(prisma, ctx, id, input);
    return jsonOk({ admin: { id: admin.id, email: admin.email } }, 201);
  } catch (err) {
    return errorResponse(err);
  }
}
