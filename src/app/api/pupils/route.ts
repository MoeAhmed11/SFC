import type { NextRequest } from "next/server";
import { prisma } from "@/server/db";
import { requireStaffContext } from "@/server/http/session";
import { errorResponse, jsonOk } from "@/server/http/respond";
import { listPupils } from "@/server/services/dataService";
import { isPupilStatus } from "@/server/domain";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireStaffContext();
    const { searchParams } = new URL(request.url);
    const classGroupId = searchParams.get("classGroupId") ?? undefined;
    const rawStatus = searchParams.get("status") ?? undefined;
    const status = isPupilStatus(rawStatus) ? rawStatus : undefined;

    const pupils = await listPupils(prisma, ctx, { classGroupId, status });
    return jsonOk({ pupils });
  } catch (err) {
    return errorResponse(err);
  }
}
