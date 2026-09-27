import type { Db } from "@/server/db";
import { recordAudit } from "@/server/audit/audit";
import { verifyPassword } from "@/server/auth/password";
import { generateSessionToken, hashToken } from "@/server/auth/tokens";
import { isStaffRole, type StaffRole } from "@/server/domain";
import { UnauthenticatedError, ValidationError } from "@/server/errors";
import type { StaffContext } from "@/server/tenancy/context";
import {
  findActiveByEmailAcrossSchools,
  findByEmailInSchool,
} from "@/server/repositories/staffRepository";
import {
  createSession,
  findSessionByTokenHash,
  revokeSessionByTokenHash,
} from "@/server/repositories/sessionRepository";
import { loginSchema } from "@/server/validation";

function sessionTtlMs(): number {
  const seconds = Number(process.env.SESSION_TTL_SECONDS ?? "28800");
  return (Number.isFinite(seconds) && seconds > 0 ? seconds : 28800) * 1000;
}

export interface LoginResult {
  token: string; // raw session token — set as an HttpOnly cookie by the caller
  expiresAt: Date;
  context: StaffContext;
}

// Authenticate a staff member within a specific school (tenant). Login is
// tenant-scoped: the same email may exist in multiple schools, so the schoolId
// is required and disambiguates. Failure messages are deliberately generic to
// avoid revealing whether an account exists (Section 11 / FR-04).
export async function login(
  db: Db,
  schoolId: string,
  input: { email: string; password: string },
): Promise<LoginResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError("Invalid email or password.");
  }

  const genericFailure = new UnauthenticatedError("Invalid email or password.");

  const staff = await findByEmailInSchool(db, schoolId, parsed.data.email);
  if (!staff || staff.status !== "active") {
    // Still run a verify against a dummy to reduce timing signal.
    await verifyPassword(parsed.data.password, null);
    throw genericFailure;
  }

  const ok = await verifyPassword(parsed.data.password, staff.passwordHash);
  if (!ok) throw genericFailure;

  if (!isStaffRole(staff.role)) {
    // Data integrity guard: role column must hold a known value.
    throw genericFailure;
  }

  const { raw, hash } = generateSessionToken();
  const expiresAt = new Date(Date.now() + sessionTtlMs());
  await createSession(db, {
    schoolId: staff.schoolId,
    staffUserId: staff.id,
    tokenHash: hash,
    expiresAt,
  });

  await recordAudit(db, {
    schoolId: staff.schoolId,
    actorType: "staff",
    actorId: staff.id,
    action: "staff.login",
    entityType: "StaffUser",
    entityId: staff.id,
  });

  return {
    token: raw,
    expiresAt,
    context: { schoolId: staff.schoolId, staffUserId: staff.id, role: staff.role as StaffRole },
  };
}

// Authenticate by email alone, resolving the tenant first (no school picker in
// the UI yet — see IMPLEMENTATION_PLAN.md). Staff email is unique PER SCHOOL,
// not globally, so if the email is active in exactly one school we log in
// there; if it matches zero or more than one school, we return the SAME
// generic failure as a wrong password (Section 11 / FR-04: never reveal
// whether — or where — an account exists).
export async function loginByEmail(
  db: Db,
  input: { email: string; password: string },
): Promise<LoginResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError("Invalid email or password.");
  }

  const matches = await findActiveByEmailAcrossSchools(db, parsed.data.email);
  if (matches.length !== 1) {
    // Burn a password verification even when there's no candidate, to keep
    // timing similar to the single-match path.
    await verifyPassword(parsed.data.password, null);
    throw new UnauthenticatedError("Invalid email or password.");
  }

  return login(db, matches[0]!.schoolId, input);
}

// Resolve a raw session token to a StaffContext, enforcing expiry and
// revocation. Returns null when the session is missing, expired, revoked, or
// the staff member is no longer active.
export async function resolveSession(db: Db, rawToken: string): Promise<StaffContext | null> {
  if (!rawToken) return null;
  const session = await findSessionByTokenHash(db, hashToken(rawToken));
  if (!session) return null;
  if (session.revokedAt) return null;
  if (session.expiresAt.getTime() <= Date.now()) return null;
  if (session.staffUser.status !== "active") return null;
  if (!isStaffRole(session.staffUser.role)) return null;

  return {
    schoolId: session.schoolId,
    staffUserId: session.staffUserId,
    role: session.staffUser.role as StaffRole,
  };
}

// Require a valid session or throw. Used by protected handlers.
export async function requireSession(db: Db, rawToken: string): Promise<StaffContext> {
  const ctx = await resolveSession(db, rawToken);
  if (!ctx) throw new UnauthenticatedError();
  return ctx;
}

export async function logout(db: Db, rawToken: string, ctx?: StaffContext): Promise<void> {
  if (!rawToken) return;
  await revokeSessionByTokenHash(db, hashToken(rawToken));
  if (ctx) {
    await recordAudit(db, {
      schoolId: ctx.schoolId,
      actorType: "staff",
      actorId: ctx.staffUserId,
      action: "staff.logout",
      entityType: "StaffUser",
      entityId: ctx.staffUserId,
    });
  }
}
