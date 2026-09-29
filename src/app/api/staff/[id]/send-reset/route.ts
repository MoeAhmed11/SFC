import { prisma } from "@/server/db";
import { requireStaffContext } from "@/server/http/session";
import { errorResponse, jsonOk } from "@/server/http/respond";
import { sendPasswordResetForStaff } from "@/server/services/passwordResetService";

interface Params {
  params: Promise<{ id: string }>;
}

// Admin-triggered password reset link for another staff member (Requirement 7
// of the MVP admin & consent enhancements spec). Admin-only via the
// staff.reset_password capability, checked inside the service.
export async function POST(_request: Request, { params }: Params) {
  try {
    const ctx = await requireStaffContext();
    const { id } = await params;
    const result = await sendPasswordResetForStaff(prisma, ctx, id);
    return jsonOk(result);
  } catch (err) {
    return errorResponse(err);
  }
}
