import type { NextRequest } from "next/server";
import { prisma } from "@/server/db";
import { requireStaffContext } from "@/server/http/session";
import { errorResponse, jsonOk } from "@/server/http/respond";
import { getEventResponses, RESPONSE_FILTERS, type ResponseFilter } from "@/server/services/dashboardService";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const ctx = await requireStaffContext();
    const { id } = await params;
    const filterParam = request.nextUrl.searchParams.get("filter") ?? "all";
    const filter = (RESPONSE_FILTERS as readonly string[]).includes(filterParam)
      ? (filterParam as ResponseFilter)
      : "all";

    const responses = await getEventResponses(prisma, ctx, id, filter);
    return jsonOk({ responses });
  } catch (err) {
    return errorResponse(err);
  }
}
