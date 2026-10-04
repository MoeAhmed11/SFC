import { cookies } from "next/headers";
import { prisma } from "@/server/db";
import { UnauthenticatedError } from "@/server/errors";
import { requirePlatformSession } from "@/server/services/platformAuthService";
import type { PlatformContext } from "@/server/platform/context";

// HTTP-layer session plumbing for the platform (super-user) layer. Mirrors
// src/server/http/session.ts exactly, but uses a DIFFERENT cookie name so a
// platform session can never be read as, or confused with, a tenant staff
// session (or vice versa). As with the staff cookie, this holds ONLY the raw
// session token — identity is always re-derived server-side from the stored
// (hashed) session record.

export const PLATFORM_SESSION_COOKIE_NAME = "sc_platform_session";

function sessionTtlSeconds(): number {
  const seconds = Number(process.env.PLATFORM_SESSION_TTL_SECONDS ?? "28800");
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 28800;
}

export async function setPlatformSessionCookie(rawToken: string): Promise<void> {
  const store = await cookies();
  store.set(PLATFORM_SESSION_COOKIE_NAME, rawToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: sessionTtlSeconds(),
  });
}

export async function clearPlatformSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(PLATFORM_SESSION_COOKIE_NAME);
}

export async function readPlatformSessionCookie(): Promise<string | null> {
  const store = await cookies();
  return store.get(PLATFORM_SESSION_COOKIE_NAME)?.value ?? null;
}

// Resolves the current request's session to a PlatformContext, or null.
export async function getPlatformContext(): Promise<PlatformContext | null> {
  const token = await readPlatformSessionCookie();
  if (!token) return null;
  try {
    return await requirePlatformSession(prisma, token);
  } catch {
    return null;
  }
}

// Resolves the current request's session or throws UnauthenticatedError. Use
// in route handlers / server components that require a signed-in platform user.
export async function requirePlatformContext(): Promise<PlatformContext> {
  const ctx = await getPlatformContext();
  if (!ctx) throw new UnauthenticatedError();
  return ctx;
}
