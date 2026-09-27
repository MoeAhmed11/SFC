import { prisma } from "@/server/db";
import { requireStaffContext } from "@/server/http/session";
import { errorResponse, jsonOk } from "@/server/http/respond";
import { getEventDashboard } from "@/server/services/dashboardService";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: Params) {
  try {
    const ctx = await requireStaffContext();
    const { id } = await params;
    const dashboard = await getEventDashboard(prisma, ctx, id);
    return jsonOk(dashboard);
  } catch (err) {
    return errorResponse(err);
  }
}
