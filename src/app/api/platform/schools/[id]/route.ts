import { prisma } from "@/server/db";
import { requirePlatformContext } from "@/server/http/platformSession";
import { errorResponse, jsonOk } from "@/server/http/respond";
import { getSchoolWithUsage } from "@/server/services/platformAdminService";
import { NotFoundError } from "@/server/errors";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requirePlatformContext();
    const { id } = await params;
    const row = await getSchoolWithUsage(prisma, ctx, id);
    if (!row) throw new NotFoundError("School not found.");
    return jsonOk(row);
  } catch (err) {
    return errorResponse(err);
  }
}
