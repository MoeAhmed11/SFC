import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { defaultRateLimiter, type RateLimiter } from "@/server/http/rateLimit";

// Route-handler-facing helper: identifies the caller, checks the limit, and
// produces a consistent 429 response. A single generic message is used so a
// throttled response never distinguishes WHY (wrong password vs. rate limit
// vs. anything else) — consistent with the rest of the app's
// information-leak-avoidance pattern (FR-04).

export interface RateLimitConfig {
  limit: number;
  windowSeconds: number;
}

// Best-effort client identifier. Trusts X-Forwarded-For only as a fallback —
// this is a rate-limiting signal, not an authorization decision, so a
// spoofed header at worst weakens throttling rather than granting access.
function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return "unknown";
}

// Checks a per-route rate limit keyed by client IP. Returns a 429
// NextResponse if the limit is exceeded, or null if the caller may proceed.
export function checkRateLimit(
  request: NextRequest,
  routeKey: string,
  config: RateLimitConfig,
  limiter: RateLimiter = defaultRateLimiter,
): NextResponse | null {
  const key = `${routeKey}:${clientIp(request)}`;
  const result = limiter.check(key, config.limit, config.windowSeconds);
  if (result.allowed) return null;

  return NextResponse.json(
    { error: "Too many requests. Please wait and try again." },
    { status: 429, headers: { "Retry-After": String(result.retryAfterSeconds) } },
  );
}

// Checks a rate limit keyed by a token/identifier value taken from the request
// itself (e.g. the consent/invite token), IN ADDITION to IP-based limiting.
// This blunts a single caller cycling through many different tokens quickly
// (which a pure per-IP limit alone wouldn't catch if the attacker also
// rotates IPs, but combined with the per-IP check raises the cost either way)
// and, more importantly, stops a single leaked/guessed token from being
// hammered rapidly regardless of source IP.
export function checkTokenRateLimit(
  routeKey: string,
  tokenOrKey: string,
  config: RateLimitConfig,
  limiter: RateLimiter = defaultRateLimiter,
): NextResponse | null {
  const key = `${routeKey}:token:${tokenOrKey}`;
  const result = limiter.check(key, config.limit, config.windowSeconds);
  if (result.allowed) return null;

  return NextResponse.json(
    { error: "Too many requests. Please wait and try again." },
    { status: 429, headers: { "Retry-After": String(result.retryAfterSeconds) } },
  );
}
