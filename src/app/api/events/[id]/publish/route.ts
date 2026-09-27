import type { NextRequest } from "next/server";
import { prisma } from "@/server/db";
import { requireStaffContext } from "@/server/http/session";
import { errorResponse, jsonOk } from "@/server/http/respond";
import { publishEvent } from "@/server/services/eventService";

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const ctx = await requireStaffContext();
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const classGroupId =
      body && typeof body === "object" && typeof (body as { classGroupId?: unknown }).classGroupId === "string"
        ? (body as { classGroupId: string }).classGroupId
        : undefined;

    const result = await publishEvent(prisma, ctx, id, { classGroupId });
    return jsonOk(result);
  } catch (err) {
    return errorResponse(err);
  }
}
