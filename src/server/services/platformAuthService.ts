import type { Db } from "@/server/db";
import { verifyPassword } from "@/server/auth/password";
import { generateSessionToken, hashToken } from "@/server/auth/tokens";
import { UnauthenticatedError, ValidationError } from "@/server/errors";
import type { PlatformContext } from "@/server/platform/context";
import { recordPlatformAudit } from "@/server/repositories/platformAuditRepository";
import { findPlatformUserByEmail } from "@/server/repositories/platformUserRepository";
import {
  createPlatformSession,
  findPlatformSessionByTokenHash,
  revokePlatformSessionByTokenHash,
} from "@/server/repositories/platformSessionRepository";
import { platformLoginSchema } from "@/server/validation";

// Mirrors authService.ts's login/session design, but for the entirely
// separate platform (super-user) account type — see
// src/server/platform/context.ts for why these are kept apart.

function sessionTtlMs(): number {
  const seconds = Number(process.env.PLATFORM_SESSION_TTL_SECONDS ?? "28800");
  return (Number.isFinite(seconds) && seconds > 0 ? seconds : 28800) * 1000;
}

export interface PlatformLoginResult {
  token: string; // raw session token — set as an HttpOnly cookie by the caller
  expiresAt: Date;
  context: PlatformContext;
}

// Failure messages are deliberately generic, matching the tenant login flow's
// information-leak avoidance (never reveal whether an account exists).
export async function platformLogin(
  db: Db,
  input: { email: string; password: string },
): Promise<PlatformLoginResult> {
  const parsed = platformLoginSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError("Invalid email or password.");
  }

  const genericFailure = new UnauthenticatedError("Invalid email or password.");

  const user = await findPlatformUserByEmail(db, parsed.data.email);
  if (!user || user.status !== "active") {
    // Still run a verify against a dummy to reduce timing signal.
    await verifyPassword(parsed.data.password, null);
    throw genericFailure;
  }

  const ok = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!ok) throw genericFailure;

  const { raw, hash } = generateSessionToken();
  const expiresAt = new Date(Date.now() + sessionTtlMs());
  await createPlatformSession(db, {
    platformUserId: user.id,
    tokenHash: hash,
    expiresAt,
  });

  await recordPlatformAudit(db, {
    platformUserId: user.id,
    action: "platform.login",
    entityType: "PlatformUser",
    entityId: user.id,
  });

  return {
    token: raw,
    expiresAt,
    context: { platformUserId: user.id },
  };
}

// Resolve a raw session token to a PlatformContext, enforcing expiry and
// revocation. Returns null when the session is missing, expired, revoked, or
// the platform user is no longer active.
export async function resolvePlatformSession(db: Db, rawToken: string): Promise<PlatformContext | null> {
  if (!rawToken) return null;
  const session = await findPlatformSessionByTokenHash(db, hashToken(rawToken));
  if (!session) return null;
  if (session.revokedAt) return null;
  if (session.expiresAt.getTime() <= Date.now()) return null;
  if (session.platformUser.status !== "active") return null;

  return { platformUserId: session.platformUserId };
}

export async function requirePlatformSession(db: Db, rawToken: string): Promise<PlatformContext> {
  const ctx = await resolvePlatformSession(db, rawToken);
  if (!ctx) throw new UnauthenticatedError();
  return ctx;
}

export async function platformLogout(
  db: Db,
  rawToken: string,
  ctx?: PlatformContext,
): Promise<void> {
  if (!rawToken) return;
  await revokePlatformSessionByTokenHash(db, hashToken(rawToken));
  if (ctx) {
    await recordPlatformAudit(db, {
      platformUserId: ctx.platformUserId,
      action: "platform.logout",
      entityType: "PlatformUser",
      entityId: ctx.platformUserId,
    });
  }
}
