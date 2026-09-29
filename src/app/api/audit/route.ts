import type { NextRequest } from "next/server";
import { prisma } from "@/server/db";
import { requireStaffContext } from "@/server/http/session";
import { errorResponse, jsonOk } from "@/server/http/respond";
import { getAuditLog } from "@/server/services/auditService";

// Audit log viewer API (Requirement 8 of the MVP admin & consent
// enhancements spec). Admin-only via the audit.view capability, checked
// inside the service. Filters: actorId, action, entityType, entityId, from,
// to (ISO date strings). Pagination: page (1-indexed), pageSize.
export async function GET(request: NextRequest) {
  try {
    const ctx = await requireStaffContext();
    const { searchParams } = new URL(request.url);

    const actorId = searchParams.get("actorId") ?? undefined;
    const action = searchParams.get("action") ?? undefined;
    const entityType = searchParams.get("entityType") ?? undefined;
    const entityId = searchParams.get("entityId") ?? undefined;
    const fromRaw = searchParams.get("from");
    const toRaw = searchParams.get("to");
    const from = fromRaw && !Number.isNaN(Date.parse(fromRaw)) ? new Date(fromRaw) : undefined;
    const to = toRaw && !Number.isNaN(Date.parse(toRaw)) ? new Date(toRaw) : undefined;

    const pageRaw = Number(searchParams.get("page") ?? "1");
    const pageSizeRaw = Number(searchParams.get("pageSize") ?? "50");

    const result = await getAuditLog(
      prisma,
      ctx,
      { actorId, action, entityType, entityId, from, to },
      {
        page: Number.isFinite(pageRaw) ? pageRaw : 1,
        pageSize: Number.isFinite(pageSizeRaw) ? pageSizeRaw : 50,
      },
    );
    return jsonOk(result);
  } catch (err) {
    return errorResponse(err);
  }
}
