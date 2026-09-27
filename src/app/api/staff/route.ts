import type { NextRequest } from "next/server";
import { prisma } from "@/server/db";
import { requireStaffContext } from "@/server/http/session";
import { errorResponse, jsonOk } from "@/server/http/respond";
import { checkRateLimit } from "@/server/http/rateLimitGuard";
import { inviteStaff, listStaff } from "@/server/services/staffAdminService";
import { issueInviteToken } from "@/server/services/inviteTokenService";
import { ValidationError } from "@/server/errors";
import { isStaffRole } from "@/server/domain";

// Throttles bulk-invite abuse (e.g. a compromised admin session or a script
// hammering this endpoint), separate from the token-guessing threat the
// consent/accept-invite routes guard against.
const INVITE_RATE_LIMIT = { limit: 20, windowSeconds: 300 };

// Base URL for the invite acceptance page; mirrors notificationService's
// parentLinkBase() pattern until a real base URL is sourced from deployment
// config.
function inviteLinkBase(): string {
  return process.env.APP_BASE_URL ? `${process.env.APP_BASE_URL}/accept-invite` : "http://localhost:3000/accept-invite";
}

export async function GET() {
  try {
    const ctx = await requireStaffContext();
    const staff = await listStaff(prisma, ctx);
    return jsonOk({ staff });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  const limited = checkRateLimit(request, "staff.invite", INVITE_RATE_LIMIT);
  if (limited) return limited;

  try {
    const ctx = await requireStaffContext();
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") throw new ValidationError("Invalid request body.");
    const { name, email, role } = body as { name?: unknown; email?: unknown; role?: unknown };
    if (typeof name !== "string" || typeof email !== "string" || !isStaffRole(role)) {
      throw new ValidationError("Name, email, and a valid role are required.");
    }

    const staff = await inviteStaff(prisma, ctx, { name, email, role });

    // Issue the acceptance token now, alongside creation. There is no real
    // email provider (Section 18.3), so the invite link is surfaced directly
    // in the response for now — an admin copies it to send manually. See
    // PILOT_READINESS.md for the plan to deliver this by email instead.
    const issued = await issueInviteToken(prisma, ctx.schoolId, staff.id);
    const inviteUrl = `${inviteLinkBase()}/${issued.raw}`;

    return jsonOk({ staff, inviteUrl }, 201);
  } catch (err) {
    return errorResponse(err);
  }
}
