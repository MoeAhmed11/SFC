import { cookies } from "next/headers";
import { prisma } from "@/server/db";
import { UnauthenticatedError } from "@/server/errors";
import { requireSession } from "@/server/services/authService";
import type { StaffContext } from "@/server/tenancy/context";

// HTTP-layer session plumbing over the existing, already-tested authService.
// The cookie holds ONLY the raw session token — identity/tenant is always
// re-derived server-side from the stored (hashed) session record, never
// trusted from any other part of the request (Section 5.4 / FR-04 pattern).

export const SESSION_COOKIE_NAME = "sc_session";

function sessionTtlSeconds(): number {
  const seconds = Number(process.env.SESSION_TTL_SECONDS ?? "28800");
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 28800;
}

// Sets the session cookie. HttpOnly (no client-side script access), SameSite=
// Lax (sent on top-level navigation, not cross-site POSTs — reasonable CSRF
// baseline until dedicated CSRF protection is added at the route layer, see
// SECURITY_AND_PRIVACY_CHECKLIST.md), Secure outside local dev.
export async function setSessionCookie(rawToken: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, rawToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: sessionTtlSeconds(),
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE_NAME);
}

export async function readSessionCookie(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE_NAME)?.value ?? null;
}

// Resolves the current request's session to a StaffContext, or null.
export async function getStaffContext(): Promise<StaffContext | null> {
  const token = await readSessionCookie();
  if (!token) return null;
  try {
    return await requireSession(prisma, token);
  } catch {
    return null;
  }
}

// Resolves the current request's session or throws UnauthenticatedError. Use
// in route handlers / server components that require a signed-in staff member.
export async function requireStaffContext(): Promise<StaffContext> {
  const ctx = await getStaffContext();
  if (!ctx) throw new UnauthenticatedError();
  return ctx;
}
