# Pilot Readiness & Known Limitations

This document states plainly what SchoolConnect can and cannot do today, so
nobody mistakes the current codebase for something ready to run a real school
pilot. It should be read alongside `IMPLEMENTATION_PLAN.md` (the overall plan),
`SECURITY_AND_PRIVACY_CHECKLIST.md`, and `ACCESSIBILITY_CHECKLIST.md`.

**This system must not be used with real pupils, guardians, or school data
in its current state.** No UK data protection or safeguarding review has been
performed (spec Section 11/18.10), and several pieces required for a pilot do
not exist yet (below).

## What is implemented

Phases 1–7 (server-side services + automated tests) and Phase 8 (the full
HTTP API + staff/parent UI layer), all with passing tests, typecheck, and
build:

1. Tenant model, staff authentication, RBAC, audit logging.
2. School data: classes, pupils, guardians, authorised relationships
   (primary-contact-only), validated CSV import.
3. Events: draft/publish/cancel/complete lifecycle, coherent date/deadline
   validation, recipient generation from primary contacts.
4. Secure parent links (hashed, recipient-bound tokens) and yes/no consent
   capture with audit history.
5. Consent dashboard totals and a consent register CSV export.
6. Notifications: a database-backed idempotent queue, a mock email provider,
   accessible/no-PII templates, and deadline/event reminders with send-time
   eligibility checks.
7. Hardening: audit coverage review, a security/privacy checklist, an
   accessibility checklist, and a failed-notification monitoring query.
8. **The full HTTP API and staff/parent UI**, built and verified in four
   slices: staff login/session; event create/publish/cancel/complete +
   dashboard + export; the parent consent page (`/c/[token]`); and CSV import
   + staff management UI.
9. **The staff invite-acceptance flow.** A newly invited staff member can now
   set a password and sign in — see below. A working school can be run
   through a browser today, invite new staff, and have them actually join.
10. **All previously-open spec decisions (Section 17) are resolved or
    explicitly deferred.** See `IMPLEMENTATION_PLAN.md` §9.0 for the full
    table. Two of them changed what's built: email provider selection is now
    configurable (`EMAIL_PROVIDER` env var) rather than hardcoded to the mock,
    and data retention now has a real default (3 years) and an admin-only
    audited sweep service, rather than not existing at all.

Every phase's README section lists exactly what it covers and what it doesn't.

## ⚠️ Brand name is not cleared for use

A web search turned up at least two existing, live apps already trading as
"SchoolConnect" in the same school-parent-communication market:
[Google Play](https://play.google.com/store/apps/details?id=com.SchoolConnect.app),
[App Store](https://apps.apple.com/us/app/school-staff/id6477534537).
This was not resolved as "keep the current name" — it is flagged as a real
collision risk. Formal UK IPO/USPTO register search wasn't available through
the tools used, so registration status specifically is unconfirmed, but
existing commercial use of the identical name in the identical market is a
risk on its own regardless of registration. **Pick a distinct name before any
public-facing use** (app store listing, marketing, a real sending domain).

## The blocking gap that has been closed

**Invited staff can now sign in.** `inviteStaff` creates an account with
`status: "invited"` and no password; previously there was no safe way to
activate one, because the only activation function
(`activateWithPassword`) has no session context or capability check and was
never meant to be reachable over HTTP.

This is now fixed with a dedicated `InviteToken` model (mirroring
`SecureAccessToken`'s design: 256-bit, hash-stored, single-use, 7-day expiry)
and `inviteAcceptanceService.acceptInvite` as the only HTTP-reachable
activation path — driven entirely by a validated token, never a bare
`staffUserId`. Inviting a staff member via `POST /api/staff` or the `/staff`
form now returns/shows a working acceptance link
(`/accept-invite/[token]`). `activateWithPassword` itself is untouched and
still has no capability check — it remains internal/test/seed-only, now
documented as such, and must never be given a route.

**Remaining practical limitation:** there is still no real email provider, so
the acceptance link is shown directly to the inviting admin rather than
emailed to the new staff member. See item 2 below.

## Other things that do NOT exist yet

1. **No self-service parent link reissue.** If a parent's link expires or is
   revoked, only staff can reissue it (`secureLinkService.reissueLink`, no UI
   yet). The invalid-link page tells parents to contact the school.
2. **No real email provider is implemented, though the selection point now
   exists.** `EMAIL_PROVIDER` (default `mock`) picks the implementation; only
   `mock` is actually built. No email leaves the system yet — invite and
   reminder links must still be copied and sent manually. A real provider
   needs a vendor decision, credentials, a sending domain, and deliverability
   setup, per Section 18.3 (no real integrations without approval). Tests
   already exercise the send path against a realistic fake provider, so a real
   adapter should mainly need implementing `EmailProvider` and adding one
   factory branch — see `EmailProviderConfig.ts`.
3. **No production datastore configured.** Development and tests use SQLite.
   The schema is PostgreSQL-compatible by design, but no PostgreSQL instance,
   connection pooling, or migration process for a hosted environment has been
   set up.
4. **No background worker deployment.** `processDueNotifications` and the new
   `retentionService.runRetentionSweep` are both callable functions, not
   running services. Nothing currently calls either on a schedule.
5. **Rate limiting is now implemented but single-instance only; CSRF has been
   reviewed, not hardened further.** Login, consent tokens, and invite tokens
   are rate-limited (`src/server/http/rateLimit.ts`), but the limiter is an
   in-process `Map` with no shared state across a horizontally-scaled
   deployment. CSRF relies on Next's built-in Server Action protection plus
   `SameSite=Lax` + JSON content-type + POST/PATCH-only mutations for `/api/*`
   routes — reviewed and documented as adequate for now, with an explicit
   residual gap (no synchronizer token) rather than a false "solved." No
   production security headers beyond `Referrer-Policy`
   (`next.config.mjs`) — no CSP, no HSTS configuration.
6. **No UI for data retention yet.** The service (`retentionService`,
   preview + sweep, admin-only, audited) exists and is tested, but there is no
   `/staff`-style page to view or trigger it — only a callable function.
7. **No CI pipeline.** Tests, typecheck, and build are run manually.
8. **No accessibility or security audit.** See the two checklist documents —
   both are forward guidance, not completed reviews.
9. **Brand name is not usable as-is.** See the warning above.

## Support and operational notes for whoever builds the next layer

- Failed notification delivery is visible via
  `monitoringService.listFailedNotificationsForSchool` — wire this into a
  staff-facing view so failures aren't silent.
- School policy flags (`allowConsentEditing`, `allowLateConsent`,
  `allowOfflineConsent`) default to **off** and can only be changed by an admin
  through `schoolSettingsService.updateSchoolSettings`, which is audited.
- The seed script (`prisma/seed.ts`) creates two synthetic demo schools with
  staff — useful for manually exercising the service layer via a script or
  future admin tooling, but contains no pupils/guardians/events yet.

## Recommended next steps toward an actual pilot

1. **Pick a distinct brand name** — this blocks any public-facing artifact
   (app store listing, domain, marketing) and is cheap to fix now versus later.
2. Select a real email provider, implement it behind the existing
   `EmailProvider` interface (one class + one `EmailProviderConfig.ts` branch),
   and run a small end-to-end send test before trusting it with real
   recipients. This would also let invite links be emailed automatically
   instead of copy-pasted by an admin.
3. Stand up a hosted PostgreSQL instance and a scheduled worker/cron process
   for both `processDueNotifications` and `retentionService.runRetentionSweep`
   — neither has a deployment target yet, only a callable function.
4. Build a self-service "request a new link" flow for parents, or explicitly
   decide it's not needed for the pilot (currently reissue is staff-only).
5. If deploying to more than one server instance, replace `InMemoryRateLimiter`
   with a Redis-backed implementation of the same `RateLimiter` interface —
   the current one only enforces limits per-instance.
6. Build a staff-facing UI for retention preview/sweep (the service exists;
   the page doesn't).
7. Commission a UK data protection/safeguarding review and an accessibility
   review before onboarding any real school (spec Section 18.10).

### Already done

- HTTP API layer + staff UI: login, event create/publish/cancel/complete,
  dashboard, export (Phase 8 slices 1–2).
- Parent consent page `/c/[token]`, verified end-to-end (Phase 8 slice 3).
- CSV import UI and staff list/invite/role-change/deactivate UI (Phase 8
  slice 4).
- Staff invite-acceptance flow: invited staff can set a password and sign in,
  verified end-to-end.
- All previously-open spec Section 17 decisions resolved or explicitly
  deferred with a stated reason (see `IMPLEMENTATION_PLAN.md` §9.0):
  reminder defaults confirmed, SMIS integration and pricing deferred, email
  provider made configurable (tested against a realistic fake provider), data
  retention defaulted to 3 years and made configurable with an audited
  preview/sweep service, and the brand name flagged as a genuine collision
  risk rather than kept unexamined.
- Rate limiting on login and token-consuming routes, plus a documented CSRF
  posture review — see `SECURITY_AND_PRIVACY_CHECKLIST.md`.
