import { prisma } from "@/server/db";
import { requireStaffContext } from "@/server/http/session";
import { errorResponse, jsonOk } from "@/server/http/respond";
import { completeEvent } from "@/server/services/eventService";

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(_request: Request, { params }: Params) {
  try {
    const ctx = await requireStaffContext();
    const { id } = await params;
    const event = await completeEvent(prisma, ctx, id);
    return jsonOk({ event });
  } catch (err) {
    return errorResponse(err);
  }
}
