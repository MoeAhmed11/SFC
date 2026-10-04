import type { NextRequest } from "next/server";
import { prisma } from "@/server/db";
import { platformLogin } from "@/server/services/platformAuthService";
import { setPlatformSessionCookie } from "@/server/http/platformSession";
import { errorResponse, jsonOk } from "@/server/http/respond";
import { checkRateLimit } from "@/server/http/rateLimitGuard";
import { ValidationError } from "@/server/errors";

// Rate limited to blunt credential-stuffing / brute-force attempts, mirroring
// the tenant login route. A platform account's blast radius spans every
// school, so this endpoint is at least as sensitive as the tenant one.
const LOGIN_RATE_LIMIT = { limit: 10, windowSeconds: 300 }; // 10 attempts / 5 min per IP

export async function POST(request: NextRequest) {
  const limited = checkRateLimit(request, "platform.auth.login", LOGIN_RATE_LIMIT);
  if (limited) return limited;

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      throw new ValidationError("Invalid request body.");
    }
    const { email, password } = body as { email?: unknown; password?: unknown };
    if (typeof email !== "string" || typeof password !== "string") {
      throw new ValidationError("Email and password are required.");
    }

    const result = await platformLogin(prisma, { email, password });
    await setPlatformSessionCookie(result.token);

    return jsonOk({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
