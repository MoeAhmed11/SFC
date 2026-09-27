import { prisma } from "@/server/db";
import { requireStaffContext } from "@/server/http/session";
import { errorResponse } from "@/server/http/respond";
import { exportConsentRegister } from "@/server/services/exportService";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: Params) {
  try {
    const ctx = await requireStaffContext();
    const { id } = await params;
    const result = await exportConsentRegister(prisma, ctx, id);

    return new Response(result.csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${result.filename}"`,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
