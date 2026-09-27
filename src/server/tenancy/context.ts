import { ForbiddenError } from "@/server/errors";
import { roleHasCapability, type Capability, type StaffRole } from "@/server/domain";

// The authenticated actor for a request. schoolId is derived from the verified
// session (never from client input), and every repository call is scoped by it.
// This is the single object that carries tenant identity through the app.
export interface StaffContext {
  readonly schoolId: string;
  readonly staffUserId: string;
  readonly role: StaffRole;
}

// Assert the actor's role grants a capability, else throw ForbiddenError.
// Centralising this keeps RBAC decisions in one testable place (Section 18.6).
export function requireCapability(ctx: StaffContext, capability: Capability): void {
  if (!roleHasCapability(ctx.role, capability)) {
    throw new ForbiddenError(`Role "${ctx.role}" lacks capability "${capability}".`);
  }
}

// Guard against operating across tenant boundaries. Any code that receives a
// schoolId from a nested record must confirm it matches the actor's tenant.
export function assertSameTenant(ctx: StaffContext, resourceSchoolId: string): void {
  if (ctx.schoolId !== resourceSchoolId) {
    // Deliberately generic message: do not reveal that a record exists in
    // another tenant (Section 11 / FR-04 information-leak avoidance).
    throw new ForbiddenError("Resource not accessible.");
  }
}
