import type { NextRequest } from "next/server";
import { prisma } from "@/server/db";
import { requireStaffContext } from "@/server/http/session";
import { errorResponse, jsonOk } from "@/server/http/respond";
import { createEventDraft, listEvents } from "@/server/services/eventService";
import { ValidationError } from "@/server/errors";

export async function GET() {
  try {
    const ctx = await requireStaffContext();
    const events = await listEvents(prisma, ctx);
    return jsonOk({ events });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireStaffContext();
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") throw new ValidationError("Invalid request body.");

    // createEventDraft validates the shape via Zod internally; the route only
    // needs to pass the parsed JSON body through.
    const input = body as Parameters<typeof createEventDraft>[2];
    const event = await createEventDraft(prisma, ctx, input);
    return jsonOk({ event }, 201);
  } catch (err) {
    return errorResponse(err);
  }
}
