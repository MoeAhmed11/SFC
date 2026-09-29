import type { NextRequest } from "next/server";
import { prisma } from "@/server/db";
import { requireStaffContext } from "@/server/http/session";
import { errorResponse, jsonOk } from "@/server/http/respond";
import { archivePupil, getPupil, getPupilConsentHistory, updatePupil } from "@/server/services/dataService";
import { ValidationError } from "@/server/errors";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const ctx = await requireStaffContext();
    const { id } = await params;
    const [pupil, consentHistory] = await Promise.all([
      getPupil(prisma, ctx, id),
      getPupilConsentHistory(prisma, ctx, id),
    ]);
    return jsonOk({ pupil, consentHistory });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const ctx = await requireStaffContext();
    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") throw new ValidationError("Invalid request body.");

    await updatePupil(prisma, ctx, id, body as Parameters<typeof updatePupil>[3]);
    return jsonOk({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

// "Delete" archives the pupil (status -> "archived") rather than removing the
// row, preserving consent/event history (Requirement 1.4). DELETE is used at
// the HTTP level since it's the closest REST verb to the user-facing action,
// but it is semantically an archive, not a row deletion.
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const ctx = await requireStaffContext();
    const { id } = await params;
    await archivePupil(prisma, ctx, id);
    return jsonOk({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
