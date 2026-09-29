# Design — MVP Admin & Consent Enhancements

## Architecture pattern (unchanged)

Every feature below follows the existing layering:

```
route.ts (Next.js API route or server action)
  -> requireStaffContext() / requireSession()   [src/server/http/session.ts]
  -> service function (src/server/services/*.ts)
       - requireCapability(ctx, "...")            [src/server/tenancy/context.ts]
       - zod validation                           [src/server/validation.ts]
       - repository calls, tenant-scoped by schoolId
       - recordAudit(db, ...)                     [src/server/audit/audit.ts]
  -> repository (src/server/repositories/*.ts)     - Prisma only, no business logic
```

New capabilities are added to `CAPABILITIES` / `ROLE_CAPABILITIES` in `src/server/domain.ts`. Per the confirmed inheritance rule, any capability given to `organiser` is also given to `admin`.

```ts
// src/server/domain.ts additions
export const CAPABILITIES = [
  // ...existing...
  "pupil.manage",     // edit/archive pupils — admin only
  "consent.resend",    // reissue a consent link for a pupil+event+guardian — admin + organiser
  "staff.delete",      // hard-delete a staff user — admin only
  "staff.reset_password", // admin sends a reset link to another staff user — admin only
  "audit.view",         // audit log viewer — admin only
] as const;

const ROLE_CAPABILITIES = {
  admin: new Set([...existing, "pupil.manage", "consent.resend", "staff.delete", "staff.reset_password", "audit.view"]),
  organiser: new Set(["event.manage", "event.view", "data.view", "consent.resend"]),
};
```

Note: `data.manage` already exists and is admin-only; pupil edit/archive could reuse it instead of a new `pupil.manage` capability. I'm introducing `pupil.manage` as a distinct capability rather than overloading `data.manage` (which today covers classes/guardians/relationships/import broadly) so pupil-specific permission changes don't accidentally affect import/class/guardian management later. Both are admin-only today so behavior is identical either way — this is a naming/future-proofing choice, flag if you'd rather just reuse `data.manage`.

---

## Requirement 1 — Pupil roster CRUD (view/edit/archive)

### Schema
No migration needed — `Pupil.status` (`"active"|"archived"`) already exists.

### Validation (`src/server/validation.ts`)
```ts
export const updatePupilSchema = z.object({
  firstName: trimmedName(80).optional(),
  lastName: trimmedName(80).optional(),
  classGroupId: z.string().trim().min(1).nullable().optional(), // null clears the class
  status: z.enum(PUPIL_STATUSES).optional(),
});
```
`externalRef` is deliberately absent — omitting it from the schema means it can never be accepted even if a client sends it (safer than accepting-then-ignoring).

### Repository (`src/server/repositories/pupilRepository.ts`)
Add:
```ts
export function updatePupilScoped(db: Db, schoolId: string, id: string, data: UpdatePupilData): Promise<number> // via updateMany, same pattern as updateStaffScoped
```
No new "delete" repository function — archiving is just `updatePupilScoped(db, schoolId, id, { status: "archived" })`.

### Service (`src/server/services/dataService.ts` or new `pupilAdminService.ts`)
```ts
export async function updatePupil(db: Db, ctx: StaffContext, pupilId: string, input: UpdatePupilInput) {
  requireCapability(ctx, "pupil.manage");
  const parsed = updatePupilSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(...);
  const count = await updatePupilScoped(db, ctx.schoolId, pupilId, parsed.data);
  if (count === 0) throw new NotFoundError("Pupil not found.");
  await recordAudit(db, { schoolId: ctx.schoolId, actorType: "staff", actorId: ctx.staffUserId,
    action: "pupil.updated", entityType: "Pupil", entityId: pupilId, metadata: parsed.data });
}

export async function archivePupil(db: Db, ctx: StaffContext, pupilId: string) {
  requireCapability(ctx, "pupil.manage");
  const count = await updatePupilScoped(db, ctx.schoolId, pupilId, { status: "archived" });
  if (count === 0) throw new NotFoundError("Pupil not found.");
  await recordAudit(db, { ..., action: "pupil.archived", entityType: "Pupil", entityId: pupilId });
}
```
`listPupilsBySchool` already exists for the roster list — extend its filter options (class, status) at the query layer, or filter client-side if the roster is small; check current signature before extending.

### Routes / UI
- `src/app/api/pupils/route.ts` — GET (list, with `?classGroupId=&status=` query filters)
- `src/app/api/pupils/[id]/route.ts` — GET (detail), PATCH (`updatePupil`), DELETE (maps to `archivePupil`, not a real row delete — named DELETE at the HTTP level since that's the closest REST verb, but semantically an archive)
- `src/app/pupils/page.tsx` — roster list page (new)
- `src/app/pupils/[id]/page.tsx` — pupil detail page (new) — this is also where Requirements 2 and 3's UI attaches
- Reuse the existing hand-rolled CSS design system classes from `globals.css` (per memory: no Tailwind, no inline styles) — mirror the table/form patterns already used in `src/app/events/[id]/page.tsx` or the staff list page.

---

## Requirement 2 — Consent history per pupil (all events)

### Repository (`src/server/repositories/consentRepository.ts`)
Add:
```ts
export function listConsentHistoryForPupil(db: Db, schoolId: string, pupilId: string) {
  return db.consentResponse.findMany({
    where: { schoolId, pupilId },
    orderBy: { submittedAt: "desc" },
    include: { event: { select: { id: true, title: true } }, guardian: { select: { id: true, name: true } } },
  });
}
```
No new indexes needed — `@@index([schoolId, eventId])` doesn't cover a pupil-only lookup, but `@@index([schoolId])` combined with the `pupilId` filter is adequate at pilot scale. If this becomes a hot path, add `@@index([schoolId, pupilId])` in a follow-up migration.

### Service
```ts
export async function getPupilConsentHistory(db: Db, ctx: StaffContext, pupilId: string) {
  requireCapability(ctx, "pupil.manage"); // same admin-only gate as pupil detail
  const pupil = await findPupilByIdInSchool(db, ctx.schoolId, pupilId);
  if (!pupil) throw new NotFoundError("Pupil not found.");
  return listConsentHistoryForPupil(db, ctx.schoolId, pupilId);
}
```

### Route / UI
Folded into `GET /api/pupils/[id]` (return `{ pupil, consentHistory }`) rather than a separate endpoint, since it's always shown together on the pupil detail page. Render as a table: event, guardian, response, state (badge for "superseded"), submittedAt, notes.

---

## Requirement 3 — Resend/reissue consent link (covers requirement 4's override too)

This is the biggest piece of new logic. Three changes: (a) make `reissueLink` also send an email, (b) relax the deadline check for freshly-reissued tokens, (c) give the old token a distinct "superseded by a newer link" error.

### 3a. Email dispatch on reissue

`reissueLink` in `secureLinkService.ts` currently only mints a token. Add a new orchestrating function in a new service, e.g. `src/server/services/consentResendService.ts`, so `secureLinkService.ts` stays focused on token mechanics:

```ts
export async function resendConsentLink(
  db: Db,
  ctx: StaffContext,
  input: { eventId: string; pupilId: string; guardianId: string },
): Promise<{ sent: boolean; error?: string }> {
  requireCapability(ctx, "consent.resend");

  const event = await findEventByIdInSchool(db, ctx.schoolId, input.eventId);
  if (!event) throw new NotFoundError("Event not found.");
  if (event.status === "cancelled" || event.status === "completed") {
    throw new ValidationError("Cannot resend a link for a cancelled or completed event.");
  }
  if (event.startsAt.getTime() <= Date.now()) {
    throw new ValidationError("Cannot resend a link after the event has started.");
  }

  const guardian = await findGuardianByIdInSchool(db, ctx.schoolId, input.guardianId);
  if (!guardian) throw new NotFoundError("Guardian not found.");

  const issued = await reissueLink(db, ctx, input); // existing: revokes old + mints new + audits "link.reissued"

  const consentUrl = buildConsentUrl(issued.raw); // same URL builder used at publish time
  const result = await sendConsentResendEmail({
    to: guardian.email,
    schoolName: ..., schoolTimezone: ...,
    consentUrl,
    expiresAt: issued.expiresAt,
  });

  await recordAudit(db, {
    schoolId: ctx.schoolId, actorType: "staff", actorId: ctx.staffUserId,
    action: "consent.link_resent",
    entityType: "Event", entityId: input.eventId,
    metadata: { pupilId: input.pupilId, guardianId: input.guardianId, emailSent: result.sent },
  });

  return result;
}
```

Reuses the same "never throw on email failure, log and return a flag" pattern as `sendStaffInviteEmail`. Add `buildConsentResendEmail` to `src/server/notifications/templates.ts` (likely a near-duplicate of whatever template `consent_request` notifications use — check `processDueNotifications`'s template call before writing a new one, to reuse instead of duplicate).

### 3b. Deadline check must allow a freshly-reissued token through

Current `submitConsent` (in `consentService.ts`) checks the deadline against `event.consentDeadline` unconditionally (modulated only by `settings.allowLateConsent`). Since a reissued token is deliberately meant to work post-deadline (per requirement), the cleanest fix is: **the deadline gate should key off the token's `createdAt`, not just the event's deadline** — i.e., if the token being used was issued/reissued AFTER the original deadline already passed, it's staff-authorized and the deadline check is skipped; if it was issued before the deadline (the normal bulk-publish case) the existing deadline logic applies unchanged. This requires `TokenBinding` (returned by `validateToken`) to also carry the token's `createdAt`/`issuedAt`, which means adding that field to `findTokenByHash`'s selected columns and to the `TokenBinding` interface.

```ts
// secureLinkService.ts — TokenBinding gains issuedAt
export interface TokenBinding {
  ...
  issuedAt: Date; // record.createdAt
}
```
```ts
// consentService.ts submitConsent — deadline check becomes:
const deadlinePassed = event.consentDeadline.getTime() < Date.now();
const tokenIssuedAfterDeadline = binding.issuedAt.getTime() > event.consentDeadline.getTime();
if (deadlinePassed && !tokenIssuedAfterDeadline && !settings.allowLateConsent) {
  throw new ValidationError("The consent deadline for this event has passed.");
}
```
This preserves existing behavior for every current test case (original bulk-issued tokens are all issued before the deadline, so `tokenIssuedAfterDeadline` is false for them) while allowing a staff-reissued-after-deadline token through. Existing tests in `tests/secure-links.test.ts` and consent submission tests should be re-run to confirm no regression — this is a behavior-sensitive change and needs explicit verification, not just a read-through.

### 3c. Distinct message for a superseded (revoked) old link

`validateToken` currently returns `null` uniformly for missing/expired/revoked, and callers surface one generic message (deliberately, to avoid leaking which case occurred — a legitimate security property for guessed/malicious tokens). But a *revoked* token is different: the parent held a real, valid link that the school itself invalidated by sending a newer one — telling them so isn't a leak, it's helpful, and doesn't require guessing a token blind.

Change `validateToken` to distinguish `revoked` from `not found/expired` in its return type:
```ts
export type TokenValidationResult =
  | { ok: true; binding: TokenBinding }
  | { ok: false; reason: "not_found" | "expired" | "revoked" };
```
This is a breaking change to `validateToken`'s signature — both call sites (`getConsentView`, `submitConsent` in `consentService.ts`) need updating to branch on `reason === "revoked"` and surface: *"This link is no longer valid because a newer link was sent for this consent request. Please check your email for the most recent message, or contact the school."* — while `not_found`/`expired` continue to share the existing generic message. This is the one place I'm deliberately loosening the "always generic" rule, and only for the revoked case, since revocation-by-reissue is not an attacker-discoverable signal (it requires having possessed the real prior token).

### Routes / UI
- `src/app/api/pupils/[id]/resend-consent/route.ts` — POST `{ eventId, guardianId }` → `resendConsentLink`
- On the pupil detail page (Requirement 1/2's page), each consent history / upcoming-event row gets a "Resend link" button when the event hasn't started yet.

---

## Requirement 5 — Hard-delete staff (conditional)

### Repository (`src/server/repositories/staffRepository.ts` + `eventRepository.ts`)
```ts
// eventRepository.ts
export function countEventsCreatedBy(db: Db, schoolId: string, staffUserId: string) {
  return db.event.count({ where: { schoolId, createdById: staffUserId } });
}
```
```ts
// staffRepository.ts
export function deleteStaffScoped(db: Db, schoolId: string, id: string) {
  return db.staffUser.deleteMany({ where: { id, schoolId } }); // cascades StaffSession, InviteToken per schema
}
```

### Service (`staffAdminService.ts`)
```ts
export async function deleteStaff(db: Db, ctx: StaffContext, staffUserId: string) {
  requireCapability(ctx, "staff.delete");
  if (staffUserId === ctx.staffUserId) throw new ValidationError("You cannot delete your own account.");

  const staff = await findByIdInSchool(db, ctx.schoolId, staffUserId);
  if (!staff) throw new NotFoundError("Staff member not found.");

  if (staff.status === "deactivated") {
    throw new ValidationError("Deactivated accounts cannot be deleted.");
  }

  const eventCount = await countEventsCreatedBy(db, ctx.schoolId, staffUserId);
  if (eventCount > 0) {
    // Force-deactivate instead of deleting, to preserve Event.createdBy attribution.
    await updateStaffScoped(db, ctx.schoolId, staffUserId, { status: "deactivated" });
    await recordAudit(db, { schoolId: ctx.schoolId, actorType: "staff", actorId: ctx.staffUserId,
      action: "staff.deactivated", entityType: "StaffUser", entityId: staffUserId,
      metadata: { reason: "delete_requested_but_has_events", eventCount } });
    throw new ConflictError(
      `This user created ${eventCount} event(s) and cannot be deleted. They have been deactivated instead.`,
    );
  }

  await recordAudit(db, { schoolId: ctx.schoolId, actorType: "staff", actorId: ctx.staffUserId,
    action: "staff.deleted", entityType: "StaffUser", entityId: staffUserId,
    metadata: { deletedName: staff.name, deletedEmail: staff.email, deletedRole: staff.role } });

  const count = await deleteStaffScoped(db, ctx.schoolId, staffUserId);
  if (count === 0) throw new NotFoundError("Staff member not found.");
}
```
Note the audit write happens BEFORE the delete (capturing name/email/role in metadata since the row disappears after), matching requirement 5.5. This mirrors the ordering already used elsewhere (write audit, then/around the mutation) — confirm against `recordAudit`'s transactional semantics (it accepts a `Db`/tx client) so both can be wrapped in one `$transaction` for atomicity, consistent with `consentService.submitConsent`'s pattern.

### Route / UI
- `src/app/api/staff/[id]/route.ts` — add DELETE handler → `deleteStaff`. Existing PATCH (role change) stays.
- Staff list page: add a "Delete" action alongside existing "Deactivate"; on the `ConflictError` (force-deactivated case), show the returned message so the admin understands what happened instead of a silent no-op.

---

## Requirement 6 — Strong password policy (classic complexity)

### Validation (`src/server/validation.ts`)
```ts
export const passwordSchema = z
  .string()
  .min(12, "Password must be at least 12 characters.")
  .max(200)
  .refine((v) => /[a-z]/.test(v), "Password must include a lowercase letter.")
  .refine((v) => /[A-Z]/.test(v), "Password must include an uppercase letter.")
  .refine((v) => /[0-9]/.test(v), "Password must include a digit.")
  .refine((v) => /[^A-Za-z0-9]/.test(v), "Password must include a symbol.");
```
Zod's `.refine` chain reports only the first failing message by default in some configurations — verify with a quick test that all four rules surface distinctly (requirement 6.2), or switch to `superRefine` collecting all issues at once if `.refine` chaining short-circuits in the installed zod version. This is a one-line risk to verify during implementation, not a design blocker.

`setPasswordSchema` (used by both invite acceptance and reset) already wraps `passwordSchema`, so both flows inherit this automatically — no other change needed per requirement 6.4.

`hashPassword`'s defense-in-depth length check in `src/server/auth/password.ts` stays as-is (length only) — it's a last-resort backstop, not the primary validation layer.

### Verification
Existing tests that create passwords with weaker strings (e.g. `"password1234"` — 12 chars, all lowercase+digit, no uppercase/symbol) will now fail validation. Search `tests/**` for such fixtures and update them to comply, otherwise the test suite breaks on this change alone.

---

## Requirement 7 — Password reset (admin-sent + self-serve)

### Schema
New model, mirroring `InviteToken` closely:
```prisma
model PasswordResetToken {
  id          String    @id @default(cuid())
  schoolId    String
  staffUserId String
  tokenHash   String    @unique
  expiresAt   DateTime
  usedAt      DateTime?
  createdAt   DateTime  @default(now())

  school    School    @relation(fields: [schoolId], references: [id], onDelete: Cascade)
  staffUser StaffUser @relation(fields: [staffUserId], references: [id], onDelete: Cascade)

  @@index([schoolId])
  @@index([staffUserId])
  @@map("password_reset_tokens")
}
```
Add back-relation arrays on `School` and `StaffUser` (per the existing SQLite/Prisma constraint noted in memory: many-relation back-arrays must be added on both sides).

Add `PASSWORD_RESET_TOKEN_TTL_MINUTES = 60` to `domain.ts` (short-lived, per requirement 7.5).

This requires a new Prisma migration (`npx prisma migrate dev`), which is a real schema change against the dev/test SQLite DB — flagging as a review point since it also affects `render.yaml`'s Postgres migration path on next deploy.

### Services

`src/server/services/passwordResetTokenService.ts` (mirrors `inviteTokenService.ts` exactly: `issue`, `peek`, `consume`).

`src/server/services/passwordResetService.ts`:
```ts
// Admin-triggered
export async function sendPasswordResetForStaff(db: Db, ctx: StaffContext, staffUserId: string) {
  requireCapability(ctx, "staff.reset_password");
  const staff = await findByIdInSchool(db, ctx.schoolId, staffUserId);
  if (!staff || staff.status !== "active") throw new NotFoundError("Staff member not found.");
  const issued = await issuePasswordResetToken(db, ctx.schoolId, staffUserId);
  const result = await sendPasswordResetEmail({ to: staff.email, resetUrl: buildResetUrl(issued.raw), expiresAt: issued.expiresAt, ... });
  await recordAudit(db, { schoolId: ctx.schoolId, actorType: "staff", actorId: ctx.staffUserId,
    action: "staff.password_reset_sent", entityType: "StaffUser", entityId: staffUserId,
    metadata: { emailSent: result.sent } });
  return result;
}

// Self-serve, unauthenticated — no StaffContext available.
export async function requestPasswordReset(db: Db, email: string): Promise<void> {
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) return; // silent — same generic response either way
  const matches = await findActiveByEmailAcrossSchools(db, parsed.data); // existing repo fn
  for (const staff of matches) {
    const issued = await issuePasswordResetToken(db, staff.schoolId, staff.id);
    await sendPasswordResetEmail({ to: staff.email, resetUrl: buildResetUrl(issued.raw), expiresAt: issued.expiresAt, ... });
    await recordAudit(db, { schoolId: staff.schoolId, actorType: "system", actorId: null,
      action: "staff.password_reset_requested", entityType: "StaffUser", entityId: staff.id });
  }
  // No return value either way — caller always shows the same generic message,
  // regardless of `matches.length`, to prevent account enumeration (req 7.2).
}

// Consuming the link
export async function resetPassword(db: Db, rawToken: string, input: { password: string }): Promise<void> {
  const parsed = setPasswordSchema.safeParse(input); // now enforces requirement 6's complexity too
  if (!parsed.success) throw new ValidationError("Password does not meet requirements.");

  const binding = await consumePasswordResetToken(db, rawToken);
  if (!binding) throw invalidResetLink();

  const passwordHash = await hashPassword(parsed.data.password);
  await db.$transaction(async (tx) => {
    const count = await updateStaffScoped(tx, binding.schoolId, binding.staffUserId, { passwordHash });
    if (count === 0) throw invalidResetLink();
    await revokeAllSessionsForStaff(tx, binding.staffUserId); // NEW repo fn — sets revokedAt on all live StaffSession rows
    await recordAudit(tx, { schoolId: binding.schoolId, actorType: "staff", actorId: binding.staffUserId,
      action: "staff.password_reset", entityType: "StaffUser", entityId: binding.staffUserId });
  });
}
```
`findActiveByEmailAcrossSchools` already exists (used at login) — reused here, not duplicated, for the self-serve lookup.

New repository function needed: `revokeAllSessionsForStaff(db, staffUserId)` in `src/server/repositories/sessionRepository.ts` (or wherever `StaffSession` writes currently live — check `authService.ts`/session repo before adding, to match existing naming).

### Routes / UI
- `src/app/api/staff/[id]/send-reset/route.ts` — POST, admin-only → `sendPasswordResetForStaff`
- `src/app/forgot-password/page.tsx` + `actions.ts` — public, unauthenticated form → `requestPasswordReset`, always shows "If an account exists for that email, we've sent a reset link."
- `src/app/reset-password/[token]/page.tsx` + `actions.ts` — mirrors `accept-invite/[token]` structure closely (preview not required here since there's no "who is this" reveal needed — arguably even showing the email is unnecessary/risky; keep the page generic: "Set a new password")
- `src/app/api/reset-password/[token]/route.ts` — mirrors `api/accept-invite/[token]/route.ts` if a same-origin JSON API is needed alongside the server action (check whether that duplication is actually used by anything before replicating it — the design doc for accept-invite doesn't explain why both exist; if it's legacy/unused, don't replicate it for reset).

### Email templates (`src/server/notifications/templates.ts`)
Add `buildPasswordResetEmail(to, { resetUrl, expiresAt, formatDate })`, following `buildStaffInviteEmail`'s shape.

---

## Requirement 8 — Audit log viewer

### Repository (`src/server/repositories/auditRepository.ts` — new)
```ts
export interface AuditLogFilter {
  actorId?: string;
  action?: string;
  from?: Date;
  to?: Date;
  entityType?: string;
  entityId?: string;
}
export function listAuditLogs(db: Db, schoolId: string, filter: AuditLogFilter, page: { skip: number; take: number }) {
  return db.auditLog.findMany({
    where: {
      schoolId,
      ...(filter.actorId && { actorId: filter.actorId }),
      ...(filter.action && { action: filter.action }),
      ...(filter.entityType && { entityType: filter.entityType }),
      ...(filter.entityId && { entityId: filter.entityId }),
      ...(filter.from || filter.to) && { createdAt: { gte: filter.from, lte: filter.to } },
    },
    orderBy: { createdAt: "desc" },
    skip: page.skip, take: page.take,
  });
}
export function countAuditLogs(db: Db, schoolId: string, filter: AuditLogFilter) { /* same where, count */ }
```

### Service (`src/server/services/auditService.ts` — new, thin wrapper)
```ts
export async function getAuditLog(db: Db, ctx: StaffContext, filter: AuditLogFilter, page: { page: number; pageSize: number }) {
  requireCapability(ctx, "audit.view");
  const skip = (page.page - 1) * page.pageSize;
  const [rows, total] = await Promise.all([
    listAuditLogs(db, ctx.schoolId, filter, { skip, take: page.pageSize }),
    countAuditLogs(db, ctx.schoolId, filter),
  ]);
  // Resolve actor names for display (best-effort — staff may have been hard-deleted per Req 5).
  const staffIds = [...new Set(rows.map((r) => r.actorId).filter(Boolean))];
  const staff = await db.staffUser.findMany({ where: { id: { in: staffIds }, schoolId: ctx.schoolId } });
  const nameById = new Map(staff.map((s) => [s.id, s.name]));
  return {
    rows: rows.map((r) => ({ ...r, actorName: r.actorId ? nameById.get(r.actorId) ?? "(deleted user)" : null })),
    total,
  };
}
```
This directly addresses requirement 8.2's "resolved to a staff name where possible" against Requirement 5's hard-delete case.

### Route / UI
- `src/app/api/audit/route.ts` — GET with query params `?actorId=&action=&from=&to=&entityType=&entityId=&page=&pageSize=`
- `src/app/audit/page.tsx` — admin-only page (guard via `ctx.role !== "admin"` redirect, consistent with how other admin-only pages presumably guard — check an existing admin-only page's guard pattern, e.g. staff list page, before writing a new one) with a filter form + paginated table.

---

## Testing strategy

Given the existing test suite (Vitest + SQLite, per memory) covers services heavily:
- New/changed service functions get unit tests mirroring existing patterns in `tests/` (e.g. `staff-admin.test.ts`, `secure-links.test.ts`, `consent.test.ts` — exact filenames to confirm at implementation time).
- Requirement 3's deadline-relaxation and revoked-token-message changes are behavior-sensitive to existing tests — run the full suite after that change specifically, before moving on.
- Requirement 6's password policy change will break any test fixture using a weak password — audit and fix those as part of that task, not after.
- Requirement 7 needs a fresh Prisma migration — run `npx prisma migrate dev` locally (SQLite) and confirm `npx prisma generate` picks up the new model before writing code against it.
- Per existing memory: use `tests/globalSetup.ts` for DB prep, not per-file `beforeAll`, to avoid Windows file-lock flakiness.
