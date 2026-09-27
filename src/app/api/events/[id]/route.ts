import type { NextRequest } from "next/server";
import { prisma } from "@/server/db";
import { requireStaffContext } from "@/server/http/session";
import { errorResponse, jsonOk } from "@/server/http/respond";
import { editEvent, getEvent } from "@/server/services/eventService";
import { ValidationError } from "@/server/errors";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const ctx = await requireStaffContext();
    const { id } = await params;
    const event = await getEvent(prisma, ctx, id);
    return jsonOk({ event });
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

    const event = await editEvent(prisma, ctx, id, body as Record<string, unknown>);
    return jsonOk({ event });
  } catch (err) {
    return errorResponse(err);
  }
}
