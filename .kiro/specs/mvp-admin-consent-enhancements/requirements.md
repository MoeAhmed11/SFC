# Requirements — MVP Admin & Consent Enhancements

## Overview

Seven user stories extending ConsaPass (SchoolConnect) beyond the current MVP: pupil roster management, per-pupil consent history, individual consent resend/change (with post-deadline override via admin/organiser), hard-delete for staff, strong invite passwords, staff password reset (admin-sent and self-serve), and an audit log viewer.

Roles today: `admin` (all capabilities) and `organiser` (`event.manage`, `event.view`, `data.view`). New capabilities are added below following the existing `admin` ⊇ `organiser` inheritance rule confirmed for this work: any capability granted to `organiser` is also granted to `admin`.

## Requirement 1 — Pupil roster: view, edit, archive

**User story:** As an admin, I want to view, edit, and delete pupil roster data, so that I can correct mistakes and keep the roster accurate without losing history.

**Acceptance criteria:**
1. WHEN an admin opens the pupil roster THEN the system SHALL list all pupils in their school (name, class, external ref, status), filterable by class and status, tenant-scoped to `ctx.schoolId`.
2. WHEN an admin opens a pupil THEN the system SHALL show a pupil detail view with editable fields: first name, last name, class group, status — and the external ref (`externalRef`) SHALL be displayed but NOT editable.
3. WHEN an admin submits an edit THEN the system SHALL validate input (same constraints as `createPupilSchema` minus `externalRef`), update the record, and write an audit log entry (`pupil.updated`) with the changed fields.
4. WHEN an admin "deletes" a pupil THEN the system SHALL set `Pupil.status = "archived"` (soft delete) rather than removing the row, preserving all related `ConsentResponse`, `EventRecipient`, and `PupilGuardianRelationship` history.
5. WHEN a pupil is archived THEN the system SHALL exclude them from active roster views and new event recipient selection by default, but SHALL still show them (and their history) when directly viewed or in consent history queries.
6. IF an admin wants full erasure (hard delete) THEN the system SHALL treat this as a separate, explicitly distinct action from archiving (out of scope for this iteration unless flagged later — not exposed in the UI now).
7. Only `admin` role may view, edit, or archive pupils (capability: `data.manage`, already admin-only).

## Requirement 2 — Consent history per pupil

**User story:** As an admin, I want to view consent history per pupil, so that I can see every response a pupil's guardians have given, across all events, including superseded ones.

**Acceptance criteria:**
1. WHEN an admin opens a pupil's detail page THEN the system SHALL show a consent history section listing every `ConsentResponse` row for that pupil across ALL events (not just one event), ordered reverse-chronologically by `submittedAt`.
2. Each history entry SHALL show: event title, guardian name, response (`granted`/`declined`), state (`current`/`superseded`), submittedAt, and notes if present.
3. The history SHALL include superseded rows, clearly marked as superseded, so the full audit trail of changes of mind is visible.
4. This view requires `data.view` at minimum (readable by anyone who can view pupils); since pupil detail is admin-only per Requirement 1, this section inherits that same admin-only gate for this iteration.

## Requirement 3 — Resend / reissue individual consent link (merged with Requirement 4 override flow)

**User story:** As an organiser or admin, I want to send or resend a consent request for an individual pupil, so that I can help a parent who says they didn't receive the email or who wants to change their response — including after the original consent deadline but before the event happens.

**Acceptance criteria:**
1. On a pupil's detail page, for each event the pupil is a recipient of, admin or organiser SHALL see a "resend link" action per guardian.
2. WHEN staff triggers resend THEN the system SHALL call the existing `reissueLink` flow: revoke any live tokens for that pupil+guardian+event (`revokeTokensForRecipient`) and mint a fresh token (`issueTokenForRecipient`).
3. WHEN a link is reissued THEN the system SHALL additionally send an email to the guardian containing the new link (today `reissueLink` only mints the token — this requirement adds actual dispatch, either by creating an immediate/due `Notification` row consumed by the existing worker, or sending directly through the configured `EmailProvider`).
4. Resend SHALL be allowed regardless of the event's `consentDeadline` (before or after), as long as the event has not started (`Event.startsAt` in the future) — a request SHALL be rejected once the event has started or the event is `cancelled`/`completed`.
5. WHEN a previously issued token is revoked by a reissue THEN a parent attempting to use the OLD link SHALL see a distinct message indicating that link is no longer valid because a newer one was sent (not the generic invalid-token message), so they know to check for a newer email.
6. WHEN the parent uses the NEW link (via the normal `/c/[token]` consent form) after the original deadline has passed THEN `submitConsent`'s deadline check SHALL permit the submission, because the token itself was freshly and deliberately reissued by staff — the deadline gate only applies to a parent self-serving via their original, unrevoked link.
7. The resulting submission follows existing supersede semantics: the new response becomes `state: "current"`; the previous response (if any) is marked `state: "superseded"`. Both directions of change (declined→granted and granted→declined) are permitted.
8. Available to both `admin` and `organiser` (new/reused capability, see Design). Audit log entry `link.reissued` (existing) plus a new `notification.resent` or equivalent entry for the email dispatch.

## Requirement 4 — Parent consent change is covered by Requirement 3

No separate mechanism is needed: a parent changing their mind (either direction, before or after the deadline, but before the event) is handled entirely by requirement 3 — the parent contacts the school, staff resends a link, the parent submits their new answer themselves through the standard consent form. There is no staff-entered "on behalf of parent" form. (This collapses the originally separate story 4 into story 3's flow, per clarification.)

## Requirement 5 — Hard-delete staff users (conditional)

**User story:** As an admin, I want to be able to delete users, not just deactivate them, so that stale accounts can be fully removed when appropriate.

**Acceptance criteria:**
1. WHEN an admin requests deletion of a staff user AND that user has never been the `createdBy` of any `Event` THEN the system SHALL hard-delete the `StaffUser` row (cascading `StaffSession` and `InviteToken` rows as already configured).
2. WHEN an admin requests deletion of a staff user AND that user HAS created one or more events THEN the system SHALL refuse the hard delete and instead force a deactivation (`status = "deactivated"`), returning a message explaining why (attribution on existing events must be preserved).
3. WHEN a staff user's status is already `"deactivated"` THEN the system SHALL refuse any further deletion attempt entirely (deactivated users are not deletable, per clarification) — deletion is only possible from `"invited"` or `"active"` status, and only when they have no created events.
4. An admin SHALL NOT be able to delete themselves (mirroring the existing self-deactivation guard).
5. Deletion SHALL write an audit log entry (`staff.deleted`) before the row is removed (since `AuditLog.actorId` has no FK, this is safe, but the entry must capture the deleted user's identifying info in `metadata` since the row will be gone).
6. Only `admin` may delete staff (capability: reuse `staff.deactivate`-tier, admin-only as today).

## Requirement 6 — Strong passwords on invite acceptance

**User story:** As a user, I want the password I create upon accepting an invite to be strong and secure, so that my account is protected.

**Acceptance criteria:**
1. WHEN a staff member sets a password (invite acceptance, or password reset per Requirement 7) THEN the system SHALL enforce classic complexity rules: minimum 12 characters (unchanged), AND at least one uppercase letter, one lowercase letter, one digit, and one symbol.
2. WHEN a password fails these rules THEN the system SHALL return a specific validation message per missing rule (not just a generic failure), surfaced in the form.
3. Password hashing continues to use the existing scrypt-based `hashPassword`/`verifyPassword` — no change to storage.
4. This rule applies everywhere `passwordSchema`/`setPasswordSchema` is used, so invite acceptance and password reset share the same policy automatically.

## Requirement 7 — Password reset (admin-sent and self-serve)

**User story:** As an admin, I want to send password reset links to other admins and organisers, and as a staff member, I want to reset my own forgotten password, so that accounts aren't permanently locked out.

**Acceptance criteria:**
1. WHEN an admin selects "send password reset" for another staff user (any role, `active` status) THEN the system SHALL generate a single-use, time-limited, hashed reset token (mirroring `InviteToken`'s design: raw token via `randomBytes(32)`, only the hash stored, `expiresAt`, `usedAt`) and email it to that user.
2. WHEN a staff member uses the self-serve "forgot password" entry point (unauthenticated) and submits their email THEN the system SHALL, if a matching active staff account exists in some school, send the same kind of reset link — and SHALL respond with an identical generic confirmation message regardless of whether the email matched, to avoid account enumeration.
3. WHEN a reset token is validated and a new password is successfully set THEN the system SHALL: update `passwordHash`, mark the token `usedAt`, invalidate all of that user's currently active sessions (revoke all `StaffSession` rows for that `staffUserId`), and write an audit log entry (`staff.password_reset`).
4. Sessions SHALL NOT be invalidated merely by issuing/sending the reset link — only once the new password is actually set (per clarification), so a user isn't logged out just because a reset was requested (including by someone else, to limit disruption/abuse potential of the admin-triggered path).
5. Reset tokens SHALL expire on a short window (proposed: 1 hour, consistent with typical reset-link practice; shorter than the 7-day invite TTL since this is a recovery path for an already-active account).
6. New password on reset SHALL be validated by the same policy as Requirement 6.
7. Admin-triggered reset is available to `admin` only. Self-serve reset is available to any staff member (unauthenticated flow, gated by email + token, not by role).

## Requirement 8 — Audit log viewer (admin only)

**User story:** As an admin, I want to view the audit log, so that I can review who did what and when.

**Acceptance criteria:**
1. WHEN an admin opens the audit log viewer THEN the system SHALL show a paginated, reverse-chronological list of `AuditLog` rows scoped to `ctx.schoolId`.
2. Each row SHALL display: timestamp, actor type, actor id (resolved to a staff name where possible, falling back to raw id if the staff record no longer exists, e.g. after Requirement 5 deletion), action, entity type/id, and metadata.
3. The viewer SHALL support filters: date range, actor, and action type at minimum; entity type/id filtering SHOULD also be supported if feasible without excessive complexity.
4. Only `admin` may access the audit log viewer (new capability, e.g. `audit.view`, admin-only).

## Cross-cutting notes

- Role inheritance: every capability introduced below that is granted to `organiser` MUST also be granted to `admin`, consistent with existing `ROLE_CAPABILITIES`.
- All new service functions follow the existing pattern: route → service function (`requireCapability` first) → repository, tenant-scoped by `ctx.schoolId`, with an audit log write on every mutation.
- No hard-delete of pupils or consent data is introduced by this iteration — only staff hard-delete (Requirement 5), which is itself conditional and restricted.
