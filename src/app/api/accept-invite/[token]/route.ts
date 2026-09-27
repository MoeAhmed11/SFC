import type { NextRequest } from "next/server";
import { prisma } from "@/server/db";
import { errorResponse, jsonOk } from "@/server/http/respond";
import { checkRateLimit, checkTokenRateLimit } from "@/server/http/rateLimitGuard";
import { acceptInvite, getInvitePreview } from "@/server/services/inviteAcceptanceService";
import { ValidationError } from "@/server/errors";

// Token-scoped only — no staff session involved, same pattern as
// /api/consent/[token]. The token is the sole source of identity. Rate
// limited both per-IP and per-token for the same reasons.
const INVITE_IP_RATE_LIMIT = { limit: 30, windowSeconds: 300 };
const INVITE_TOKEN_RATE_LIMIT = { limit: 20, windowSeconds: 300 };

interface Params {
  params: Promise<{ token: string }>;
}

export async function GET(request: NextRequest, { params }: Params) {
  const { token } = await params;
  const ipLimited = checkRateLimit(request, "accept-invite.view", INVITE_IP_RATE_LIMIT);
  if (ipLimited) return ipLimited;
  const tokenLimited = checkTokenRateLimit("accept-invite.view", token, INVITE_TOKEN_RATE_LIMIT);
  if (tokenLimited) return tokenLimited;

  try {
    const preview = await getInvitePreview(prisma, token);
    return jsonOk({ preview });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  const { token } = await params;
  const ipLimited = checkRateLimit(request, "accept-invite.submit", INVITE_IP_RATE_LIMIT);
  if (ipLimited) return ipLimited;
  const tokenLimited = checkTokenRateLimit("accept-invite.submit", token, INVITE_TOKEN_RATE_LIMIT);
  if (tokenLimited) return tokenLimited;

  try {
    const body = await request.json().catch(() => null);
    const password = body && typeof body === "object" ? (body as { password?: unknown }).password : undefined;
    if (typeof password !== "string") throw new ValidationError("A password is required.");

    await acceptInvite(prisma, token, { password });
    return jsonOk({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
