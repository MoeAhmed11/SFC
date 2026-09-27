import type { NextRequest } from "next/server";
import { prisma } from "@/server/db";
import { errorResponse, jsonOk } from "@/server/http/respond";
import { checkRateLimit, checkTokenRateLimit } from "@/server/http/rateLimitGuard";
import { getConsentView, submitConsent } from "@/server/services/consentService";
import { ValidationError } from "@/server/errors";

// Token-scoped only — there is deliberately no staff session check here. The
// token itself, validated server-side inside consentService, is the sole
// source of identity (FR-04). Nothing from the URL besides the opaque token is
// trusted.
//
// Rate limited two ways (FR-04 "rate-limit sensitive endpoints"): per-IP, to
// blunt a single source scanning many tokens, and per-token, so a single
// leaked/guessed token can't be hammered rapidly regardless of source IP.
const CONSENT_IP_RATE_LIMIT = { limit: 30, windowSeconds: 300 };
const CONSENT_TOKEN_RATE_LIMIT = { limit: 20, windowSeconds: 300 };

interface Params {
  params: Promise<{ token: string }>;
}

export async function GET(request: NextRequest, { params }: Params) {
  const { token } = await params;
  const ipLimited = checkRateLimit(request, "consent.view", CONSENT_IP_RATE_LIMIT);
  if (ipLimited) return ipLimited;
  const tokenLimited = checkTokenRateLimit("consent.view", token, CONSENT_TOKEN_RATE_LIMIT);
  if (tokenLimited) return tokenLimited;

  try {
    const view = await getConsentView(prisma, token);
    return jsonOk({ view });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  const { token } = await params;
  const ipLimited = checkRateLimit(request, "consent.submit", CONSENT_IP_RATE_LIMIT);
  if (ipLimited) return ipLimited;
  const tokenLimited = checkTokenRateLimit("consent.submit", token, CONSENT_TOKEN_RATE_LIMIT);
  if (tokenLimited) return tokenLimited;

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") throw new ValidationError("Invalid request body.");

    const { response, notes } = body as { response?: unknown; notes?: unknown };
    if (typeof response !== "string") throw new ValidationError("A response is required.");

    const confirmation = await submitConsent(prisma, token, {
      response,
      notes: typeof notes === "string" ? notes : undefined,
    });
    return jsonOk({ confirmation });
  } catch (err) {
    return errorResponse(err);
  }
}
