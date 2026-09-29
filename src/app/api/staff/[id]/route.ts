import type { NextRequest } from "next/server";
import { prisma } from "@/server/db";
import { requireStaffContext } from "@/server/http/session";
import { errorResponse, jsonOk } from "@/server/http/respond";
import { changeRole, deleteStaff } from "@/server/services/staffAdminService";
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

// Hard-deletes a staff user, unless they've created events — in which case
// deleteStaff force-deactivates them instead and reports why via a 409
// (Requirement 5 of the MVP admin & consent enhancements spec).
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const ctx = await requireStaffContext();
    const { id } = await params;
    await deleteStaff(prisma, ctx, id);
    return jsonOk({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
