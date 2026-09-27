import { prisma } from "@/server/db";
import { requireStaffContext } from "@/server/http/session";
import { errorResponse, jsonOk } from "@/server/http/respond";
import { deactivateStaff } from "@/server/services/staffAdminService";

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(_request: Request, { params }: Params) {
  try {
    const ctx = await requireStaffContext();
    const { id } = await params;
    await deactivateStaff(prisma, ctx, id);
    return jsonOk({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
