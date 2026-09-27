import { prisma } from "@/server/db";
import { requireStaffContext } from "@/server/http/session";
import { errorResponse, jsonOk } from "@/server/http/respond";
import { listClasses } from "@/server/services/dataService";

export async function GET() {
  try {
    const ctx = await requireStaffContext();
    const classes = await listClasses(prisma, ctx);
    return jsonOk({ classes });
  } catch (err) {
    return errorResponse(err);
  }
}
