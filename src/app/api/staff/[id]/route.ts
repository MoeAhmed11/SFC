import type { NextRequest } from "next/server";
import { prisma } from "@/server/db";
import { requireStaffContext } from "@/server/http/session";
import { errorResponse, jsonOk } from "@/server/http/respond";
import { changeRole } from "@/server/services/staffAdminService";
import { ValidationError } from "@/server/errors";
import { isStaffRole } from "@/server/domain";

interface Params {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const ctx = await requireStaffContext();
    const { id } = await params;
    const body = await request.json().catch(() => null);
    const role = body && typeof body === "object" ? (body as { role?: unknown }).role : undefined;
    if (!isStaffRole(role)) throw new ValidationError("A valid role is required.");

    await changeRole(prisma, ctx, id, { role });
    return jsonOk({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
