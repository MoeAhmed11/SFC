import type { NextRequest } from "next/server";
import { prisma } from "@/server/db";
import { loginByEmail } from "@/server/services/authService";
import { setSessionCookie } from "@/server/http/session";
import { errorResponse, jsonOk } from "@/server/http/respond";
import { checkRateLimit } from "@/server/http/rateLimitGuard";
import { ValidationError } from "@/server/errors";

// Rate limited to blunt credential-stuffing / brute-force attempts (Section
// 11 Security: "rate limiting"; FR-04 "rate-limit sensitive endpoints").
const LOGIN_RATE_LIMIT = { limit: 10, windowSeconds: 300 }; // 10 attempts / 5 min per IP

export async function POST(request: NextRequest) {
  const limited = checkRateLimit(request, "auth.login", LOGIN_RATE_LIMIT);
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

    const result = await loginByEmail(prisma, { email, password });
    await setSessionCookie(result.token);

    return jsonOk({ role: result.context.role });
  } catch (err) {
    return errorResponse(err);
  }
}
