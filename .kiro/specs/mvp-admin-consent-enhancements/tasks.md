# Tasks — MVP Admin & Consent Enhancements

Ordered so foundational pieces (capabilities, schema) land first, then each user-facing feature, then the audit viewer that depends on several others existing. Each task should end with the relevant test(s) passing before moving to the next.

- [ ] 1. Foundation: capabilities and shared plumbing
  - [ ] 1.1 Add `pupil.manage`, `consent.resend`, `staff.delete`, `staff.reset_password`, `audit.view` to `CAPABILITIES` and `ROLE_CAPABILITIES` in `src/server/domain.ts` (organiser gets `consent.resend` only; admin gets all five plus everything it already has).
  - [ ] 1.2 Update `passwordSchema` in `src/server/validation.ts` to require upper/lower/digit/symbol (Requirement 6). Verify all four `.refine` messages surface independently (test with a password missing exactly one rule at a time); switch to `superRefine` if `.refine` chaining swallows messages.
  - [ ] 1.3 Grep `tests/**` for password fixtures that no longer satisfy the new policy and update them so the existing suite passes before continuing.
  - [ ] 1.4 Run the full test suite (`npm test` or equivalent) to confirm baseline is green after 1.1–1.3.

- [ ] 2. Pupil roster: view, edit, archive (Requirement 1)
  - [ ] 2.1 Add `updatePupilSchema` to `src/server/validation.ts` (no `externalRef` field).
  - [ ] 2.2 Add `updatePupilScoped` to `src/server/repositories/pupilRepository.ts`; extend `listPupilsBySchool` (or add a filtered variant) to support class/status filters.
  - [ ] 2.3 Add `updatePupil` and `archivePupil` to a pupil admin service (new `src/server/services/pupilAdminService.ts` or extend `dataService.ts` if that's the established home for pupil writes — check first), each gated by `pupil.manage`, each writing an audit entry.
  - [ ] 2.4 Add `GET/PATCH/DELETE /api/pupils/[id]` and `GET /api/pupils` routes.
  - [ ] 2.5 Build `src/app/pupils/page.tsx` (roster list with class/status filters) and `src/app/pupils/[id]/page.tsx` (detail + edit form + archive action), reusing existing `globals.css` component classes.
  - [ ] 2.6 Unit tests for `updatePupil`/`archivePupil` (capability check, externalRef rejection, not-found, audit written).

- [ ] 3. Consent history per pupil (Requirement 2)
  - [ ] 3.1 Add `listConsentHistoryForPupil` to `src/server/repositories/consentRepository.ts`.
  - [ ] 3.2 Add `getPupilConsentHistory` service function, gated by `pupil.manage`.
  - [ ] 3.3 Fold history into the `GET /api/pupils/[id]` response; render as a table on the pupil detail page (event, guardian, response, state badge, submittedAt, notes), including superseded rows.
  - [ ] 3.4 Unit test: a pupil with responses across two events and a superseded row returns all of them in the right order.

- [ ] 4. Resend consent link + post-deadline override (Requirements 3 & 4)
  - [ ] 4.1 Extend `TokenBinding`/`findTokenByHash` to expose the token's `createdAt` as `issuedAt`.
  - [ ] 4.2 Change `validateToken`'s return shape to distinguish `revoked` from `not_found`/`expired` (`TokenValidationResult` union per design). Update both call sites in `consentService.ts` (`getConsentView`, `submitConsent`) to branch and surface the distinct "a newer link was sent" message only for `revoked`.
  - [ ] 4.3 Update `submitConsent`'s deadline check to skip the deadline gate when `binding.issuedAt` is after `event.consentDeadline` (freshly reissued token), leaving all other deadline behavior unchanged.
  - [ ] 4.4 Run `tests/secure-links.test.ts` and consent submission tests; fix any breakage from 4.1–4.3 before proceeding.
  - [ ] 4.5 Add `buildConsentResendEmail` (or reuse the existing consent-request template) in `src/server/notifications/templates.ts`.
  - [ ] 4.6 Add `resendConsentLink` in new `src/server/services/consentResendService.ts`: capability check (`consent.resend`), event-state guard (not cancelled/completed/started), calls `reissueLink`, sends email, writes `consent.link_resent` audit entry.
  - [ ] 4.7 Add `POST /api/pupils/[id]/resend-consent` route.
  - [ ] 4.8 Add "Resend link" action per upcoming-event/guardian row on the pupil detail page, available to both admin and organiser.
  - [ ] 4.9 Unit tests: resend before deadline, resend after deadline but before event start (succeeds), resend after event start (rejected), old token shows revoked-specific message after a resend, parent can submit granted→declined and declined→granted via a resent link.

- [ ] 5. Hard-delete staff (Requirement 5)
  - [ ] 5.1 Add `countEventsCreatedBy` to `src/server/repositories/eventRepository.ts` and `deleteStaffScoped` to `staffRepository.ts`.
  - [ ] 5.2 Add `deleteStaff` to `staffAdminService.ts`: self-delete guard, deactivated-status guard, event-count guard (force-deactivate + `ConflictError` if >0), audit-before-delete capturing name/email/role in metadata, wrapped in a transaction with the delete itself.
  - [ ] 5.3 Add `DELETE /api/staff/[id]/route.ts` handler.
  - [ ] 5.4 Add a "Delete" action to the staff list UI alongside "Deactivate"; surface the force-deactivate explanation message when returned.
  - [ ] 5.5 Unit tests: delete with no events succeeds and removes the row; delete with events force-deactivates and throws `ConflictError`; delete on an already-deactivated user is rejected outright; self-delete is rejected.

- [ ] 6. Password reset — schema and token service (Requirement 7, part 1)
  - [ ] 6.1 Add `PasswordResetToken` model to `prisma/schema.prisma` (mirrors `InviteToken`), with back-relations on `School` and `StaffUser`. Add `PASSWORD_RESET_TOKEN_TTL_MINUTES` to `domain.ts`.
  - [ ] 6.2 Run `npx prisma migrate dev` (SQLite) and `npx prisma generate`; confirm the app still builds/tests against the new schema.
  - [ ] 6.3 Add `src/server/services/passwordResetTokenService.ts` (`issue`, `peek`, `consume`) mirroring `inviteTokenService.ts`.
  - [ ] 6.4 Add `revokeAllSessionsForStaff` to the session repository (check existing naming/location before adding).

- [ ] 7. Password reset — admin-sent flow (Requirement 7, part 2)
  - [ ] 7.1 Add `buildPasswordResetEmail` template.
  - [ ] 7.2 Add `sendPasswordResetForStaff` service function, gated by `staff.reset_password`, only for `active` staff.
  - [ ] 7.3 Add `POST /api/staff/[id]/send-reset/route.ts`.
  - [ ] 7.4 Add a "Send password reset" action on the staff list UI, admin-only.
  - [ ] 7.5 Unit test: sending a reset issues a token and calls the email provider; sending for a non-active staff member is rejected.

- [ ] 8. Password reset — self-serve flow + consumption (Requirement 7, part 3)
  - [ ] 8.1 Add `requestPasswordReset` (unauthenticated, always-generic-response, reuses `findActiveByEmailAcrossSchools`).
  - [ ] 8.2 Add `resetPassword` (consume token, validate new password via `setPasswordSchema`, update `passwordHash`, revoke all sessions, audit `staff.password_reset`) — wrapped in a transaction.
  - [ ] 8.3 Add `src/app/forgot-password/page.tsx` + `actions.ts` (public).
  - [ ] 8.4 Add `src/app/reset-password/[token]/page.tsx` + `actions.ts` (public, generic — no identity preview).
  - [ ] 8.5 Unit tests: self-serve request for an unknown email returns the same generic result as a known one (no enumeration signal); resetting invalidates existing sessions only after success, not on link-send; reset respects Requirement 6's password policy; a used/expired token is rejected with the generic invalid-link message; sessions are untouched if reset is merely requested/sent but not completed.

- [ ] 9. Audit log viewer (Requirement 8)
  - [ ] 9.1 Add `src/server/repositories/auditRepository.ts` (`listAuditLogs`, `countAuditLogs` with filter support: actorId, action, date range, entityType/entityId).
  - [ ] 9.2 Add `src/server/services/auditService.ts::getAuditLog`, gated by `audit.view`, resolving actor names best-effort (handles staff hard-deleted per Requirement 5, showing "(deleted user)").
  - [ ] 9.3 Add `GET /api/audit/route.ts` with query-param filters and pagination.
  - [ ] 9.4 Add `src/app/audit/page.tsx`: admin-only guard, filter form (date range, actor, action type; entity type/id if straightforward), paginated reverse-chronological table.
  - [ ] 9.5 Unit tests: filter by actor, by action, by date range; pagination math; actor name resolution for a deleted staff user.

- [ ] 10. Final verification
  - [ ] 10.1 Run the full test suite and fix any regressions across all changed areas.
  - [ ] 10.2 Manually verify the two flows that can't be unit-tested easily (per existing memory: Next.js route/cookie behavior needs manual HTTP verification) — start `npm run dev`, exercise resend-link and password-reset end to end, then stop the server.
  - [ ] 10.3 Update `PILOT_READINESS.md`/`IMPLEMENTATION_PLAN.md` if they track feature completion status (check their current content before editing).
