# Pilot Readiness & Known Limitations

This document states plainly what ConsaPass can and cannot do today, so
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

## ✓ Brand renamed to ConsaPass

The working name "SchoolConnect" was flagged as a real collision risk (at
least two existing, live apps traded under that exact name in the same
school-parent-communication market — see the git history of this file for
the original warning). The product has since been renamed to **ConsaPass**,
with the domain `consapass.co.uk` confirmed by the product owner. A formal UK
IPO/USPTO trademark register search still has not been performed through
the tools available in this environment — treat the name as domain-confirmed,
not formally trademark-cleared, and do a proper register search before any
large-scale public launch (app store listing, paid marketing).

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

**Invite emails are now sent automatically, not just copy-pasted.** Both
`POST /api/staff` and the `/staff` invite form now call
`staffInviteEmailService.sendStaffInviteEmail` right after issuing the invite
token, which sends through whichever `EmailProvider` is configured
(`EMAIL_PROVIDER=resend` in `render.yaml`, `mock` locally by default). The
send is deliberately non-blocking: if it fails (misconfiguration, provider
outage), invite creation still succeeds and the response/UI still returns the
raw `inviteUrl` as a copy-paste fallback — an admin is never stuck unable to
invite someone because of an email hiccup. Failures are also logged
server-side (`console.error` in `staffInviteEmailService`) so a misconfigured
deployment is diagnosable from Render's log stream, not just the generic UI
message. See `tests/staff-invite-email.test.ts`.

**Resend is now live and verified end-to-end in production.** The
`consapass.co.uk` sending domain is verified in the Resend dashboard,
`RESEND_API_KEY` is set on Render, and both parent consent/reminder emails
and staff invite emails have been confirmed delivered against the real
`consapass-web` deployment. One operational pitfall hit and fixed along the
way: `RESEND_API_KEY` is a `sync: false` secret defined separately on **each**
`render.yaml` service (`consapass-web` and `consapass-worker`) — Render does
not share it between services just because the key name matches. The worker
had it set and reminders sent fine; the web service didn't, so invite emails
silently failed with nothing in Resend's logs (the send never left our
process) until the key was added there too. If email stops working for only
one of the two send paths again, check that service's own env vars in the
Render dashboard first.

## Other things that do NOT exist yet

1. **No self-service parent link reissue.** If a parent's link expires or is
   revoked, only staff can reissue it (`secureLinkService.reissueLink`, no UI
   yet). The invalid-link page tells parents to contact the school.
2. **No production datastore configured locally.** Development and tests use
   SQLite; the deployed app on Render uses managed Postgres (see `HOSTING.md`).
   The schema is pinned to `postgresql` on `main`, so local dev/test requires
   the temporary provider swap documented in `HOSTING.md`.
3. **No background worker deployment outside Render.** `processDueNotifications`
   and `retentionService.runRetentionSweep` only run on a schedule via the
   `consapass-worker` Render cron job — there is no equivalent scheduled
   trigger for any other hosting target.
4. **Rate limiting is implemented but single-instance only; CSRF has been
   reviewed, not hardened further.** Login, consent tokens, and invite tokens
   are rate-limited (`src/server/http/rateLimit.ts`), but the limiter is an
   in-process `Map` with no shared state across a horizontally-scaled
   deployment. CSRF relies on Next's built-in Server Action protection plus
   `SameSite=Lax` + JSON content-type + POST/PATCH-only mutations for `/api/*`
   routes — reviewed and documented as adequate for now, with an explicit
   residual gap (no synchronizer token) rather than a false "solved." No
   production security headers beyond `Referrer-Policy`
   (`next.config.mjs`) — no CSP, no HSTS configuration.
5. **No UI for data retention yet.** The service (`retentionService`,
   preview + sweep, admin-only, audited) exists and is tested, but there is no
   `/staff`-style page to view or trigger it — only a callable function.
6. **No CI pipeline.** Tests, typecheck, and build are run manually.
7. **No accessibility or security audit.** See the two checklist documents —
   both are forward guidance, not completed reviews.

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

1. Build a self-service "request a new link" flow for parents, or explicitly
   decide it's not needed for the pilot (currently reissue is staff-only).
2. If deploying to more than one server instance, replace `InMemoryRateLimiter`
   with a Redis-backed implementation of the same `RateLimiter` interface —
   the current one only enforces limits per-instance.
3. Build a staff-facing UI for retention preview/sweep (the service exists;
   the page doesn't).
4. Commission a UK data protection/safeguarding review and an accessibility
   review before onboarding any real school (spec Section 18.10).
5. Run a proper UK IPO/USPTO trademark register search on "ConsaPass" before
   any large-scale public launch — the domain is confirmed, but formal
   trademark clearance hasn't been checked through the tools available here.

### Already done

- HTTP API layer + staff UI: login, event create/publish/cancel/complete,
  dashboard, export (Phase 8 slices 1–2).
- Parent consent page `/c/[token]`, verified end-to-end (Phase 8 slice 3).
- CSV import UI and staff list/invite/role-change/deactivate UI (Phase 8
  slice 4).
- Staff invite-acceptance flow: invited staff can set a password and sign in,
  verified end-to-end.
- Production deploy on Render (Postgres, web service, worker cron job) is
  live, with the `consapass.co.uk` domain and DNS resolving. Resend is
  verified end-to-end in production for both parent consent/reminder emails
  and staff invite emails.
- All previously-open spec Section 17 decisions resolved or explicitly
  deferred with a stated reason (see `IMPLEMENTATION_PLAN.md` §9.0):
  reminder defaults confirmed, SMIS integration and pricing deferred, email
  provider selected and implemented (Resend, tested against a realistic fake
  provider), data retention defaulted to 3 years and made configurable with
  an audited preview/sweep service, and the brand renamed to ConsaPass
  (domain `consapass.co.uk` confirmed) after the original name was flagged
  as a genuine collision risk.
- Rate limiting on login and token-consuming routes, plus a documented CSRF
  posture review — see `SECURITY_AND_PRIVACY_CHECKLIST.md`.
