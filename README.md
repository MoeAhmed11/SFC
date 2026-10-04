# ConsaPass

School-facing SaaS for UK primary schools to create activities, collect
parental consent digitally, track responses, and send deadline/event reminders.
Domain: `consapass.co.uk` (confirmed; formal trademark clearance not yet
checked — see "Brand name" below).

This repository is being built in reviewable phases against
[`school_consent_platform_kiro_spec.md`](./school_consent_platform_kiro_spec.md).
The full plan is in [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md).

> **Status: Phase 8 COMPLETE, plus the staff invite-acceptance flow, the
> remaining spec decisions, and rate limiting (on Phases 1–7).** The full
> HTTP API + staff/parent UI layer exists, invited staff can sign in, all
> previously-open product decisions (spec Section 17) are resolved or
> explicitly deferred, and sensitive endpoints are rate-limited — see
> "Rate limiting" below. See [Pilot readiness](./PILOT_READINESS.md) for
> what's still missing (verifying the Resend sending domain end-to-end,
> production datastore, worker deployment).
> Not production-ready and not a claim of legal/data-protection compliance
> (spec Section 11 / 18.10). A UK data protection and safeguarding review is
> required before any real use.

## Resolved product decisions

All previously-open decisions from the spec (Section 17) now have a resolution
or an explicit, reasoned deferral. Full detail is in
`IMPLEMENTATION_PLAN.md` §9.0; summary:

| # | Decision | Resolution |
| --- | --- | --- |
| 17.1 | School management systems to integrate | **Deferred** to a later iteration, as originally scoped (Section 12 Phase 2). No integration work in progress. |
| 17.2 | Guardian rules | **Resolved earlier:** only the primary contact is notified/consents. |
| 17.3–17.5 | Late/edited/offline consent | **Resolved earlier:** all disabled by default, school-configurable. |
| 17.6–17.7 | Reminder defaults & timing | **Confirmed as implemented:** 7/3/1 days before deadline; 1 day before the event. |
| 17.8 | Email provider/domain | **Resend selected and implemented; `consapass.co.uk` is the sending domain.** See "Email provider configuration" below. |
| 17.9 | Data retention | **Defaulted to 3 years, per-school configurable.** See "Data retention" below. |
| 17.10 | Pricing and pilot terms | **Deferred** to a later iteration, closer to production deployment. |
| 17.11 | Brand name | **Renamed to ConsaPass** (domain `consapass.co.uk` confirmed). See "Brand name" below. |
| 17.12 | Consent form scope | **Resolved earlier:** simple yes/no only. |

### Email provider configuration

**Resend** has been selected as the email vendor, with `consapass.co.uk` as
the confirmed sending domain (Section 18.3 approval given). `EMAIL_PROVIDER`
(env var, default `mock`; `render.yaml` sets `resend`) selects the
implementation via `createEmailProvider()` in
`src/server/notifications/EmailProviderConfig.ts`. Selecting `resend` requires
`RESEND_API_KEY` and `EMAIL_FROM` (see "Environment variables" below);
selecting an unimplemented provider name (`smtp`) fails loudly at startup
rather than silently sending nothing — a misconfigured deployment should
never fail silently. `src/server/notifications/providers/resend.ts`
implements `EmailProvider` against Resend's HTTP API directly (`fetch`, no
SDK dependency), mapping Resend's error responses onto the existing
`EmailDeliveryError` codes the notification worker already retries on.

Per the product owner's direction, **tests exercise the app as if a real
provider were configured**, not just against the trivial in-memory mock every
other suite uses. `tests/fixtures/fakeHttpEmailProvider.ts` is a second
`EmailProvider` implementation that simulates network latency and
vendor-shaped failure codes (`rate_limited`, `invalid_recipient`,
`service_unavailable`) distinct from the mock's generic `provider_error`.
`tests/email-provider-config.test.ts` runs the real notification worker
against it, proving the abstraction (and idempotency, and retry-on-next-run)
holds for more than one implementation.

### Data retention

Defaults to **3 years**, configurable per school between 1 and 10 years
(`SchoolSettings.dataRetentionYears`, admin-only, audited via the existing
`school.manage_settings` capability). `retentionService` provides:

- `previewRetentionSweep` — a read-only count of what a sweep would remove.
- `runRetentionSweep` — deletes expired records, audited with counts only.

What is eligible for deletion once older than the retention cutoff: superseded
(corrected) consent responses, terminal notifications, and audit log entries.
**What is never deleted by a sweep, regardless of age:** the *current* consent
response for any pupil/event/guardian (Section 10 — losing the only record of
an existing response would silently turn a real answer into an apparent
non-response), and pupil/guardian/relationship records (no retention policy
has been defined for those yet).

Like `processDueNotifications`, there is no scheduler running this
automatically — it's an explicitly-invoked, callable service awaiting a
deployed worker (see `PILOT_READINESS.md`).

### Brand name

The original working name, "SchoolConnect," was flagged as a real collision
risk — at least two existing, live apps traded under that exact name in the
same school-parent-communication market. The product has been renamed to
**ConsaPass**, with the domain `consapass.co.uk` confirmed by the product
owner. A formal UK IPO/USPTO trademark register search still hasn't been
performed through the tools available in this environment — the name is
domain-confirmed, not formally trademark-cleared. Run that search before any
large-scale public launch (app store listing, paid marketing).

## Staff invite-acceptance flow

Closes the gap flagged at the end of Phase 8: `inviteStaff` created accounts
with no way to ever activate them, because the only activation function
(`activateWithPassword`) has no session context and no capability check, so it
was unsafe to expose over HTTP.

- **`InviteToken` model**, deliberately mirroring `SecureAccessToken`'s design:
  a 256-bit random token, hash-stored only, bound to one staff user, single-use
  (`usedAt` set atomically on consumption via a status-guarded update — a
  concurrent double-submit can only succeed once), and expiring after 7 days.
- **`inviteAcceptanceService.acceptInvite`** is the only HTTP-reachable
  activation path. It validates the password shape *before* consuming the
  token (so a mistaken short-password attempt doesn't waste the one-time
  link), then consumes the token and activates the account atomically. Any
  failure — unknown, expired, already-used, or already-activated — returns the
  same generic error, matching the parent consent flow's information-leak
  avoidance.
- **`activateWithPassword` is untouched but now clearly documented as
  internal/test/seed-only** — it still has no capability check, and a comment
  now says explicitly that it must never be called from an HTTP route. All 94
  pre-existing tests and `prisma/seed.ts` keep using it unchanged for
  bootstrapping, since a first admin account has no invite to accept.
- **`POST /api/staff`** and the `/staff` invite form now issue a real invite
  token and return/display the acceptance link. There is still no real email
  provider (Section 18.3), so the link is surfaced directly to the inviting
  admin rather than emailed — documented as the next thing to wire up.
- **`/accept-invite/[token]`** and `GET/POST /api/accept-invite/[token]`: the
  parent-consent-page pattern applied to staff — a single opaque token in the
  URL is the sole source of identity, resolved entirely server-side.
- **Verified**: 14 new tests (hashing, single-use consumption, expiry, cross-
  school isolation, activation, audit) plus the full pre-existing suite (108
  total), typecheck, and build all pass. Manually verified end-to-end against
  a running dev server: invited a real staff member, received a working
  acceptance link in the API response, viewed the acceptance page and its API
  preview, accepted with a chosen password, confirmed the token cannot be
  reused (401), and logged in as the newly-activated account with the correct
  role. The invalid-link state was also confirmed to render safely (200 on the
  page, generic message).

## Platform (super-user) layer

A platform-level super-user role, entirely separate from the tenant-scoped
`StaffUser`/`admin`/`organiser` roles above. A `PlatformUser`:

- Can create a new school together with its first admin, or add an admin to
  an existing school, in both cases via a web UI rather than a shell script.
- Can view **read-only usage counts** (staff/pupil/guardian/event counts,
  published events, current consent responses) across every school.
- Has **no access to any tenant's operational data** — no pupils, guardians,
  consent responses, or audit logs. The platform routes/services never accept
  a `StaffContext`, and the staff-facing routes never accept a
  `PlatformContext`, so the two account types cannot be substituted for one
  another.

This is a deliberate reversal of the earlier design decision that "school
creation is deliberately not exposed over HTTP" (see
`scripts/bootstrap-admin.ts`): it's still true that there is no *self-service*
signup for either schools or platform users, but an authenticated super-user
can now do over HTTP what previously required direct database/shell access.

### Design

- **Fully separate login/session system.** `PlatformUser`, `PlatformSession`,
  and `PlatformAuditLog` are new Prisma models with no `schoolId` at all —
  they are not a variant of `StaffUser`. Sessions use a different cookie
  (`sc_platform_session` vs `sc_session`), a different context type
  (`PlatformContext` vs `StaffContext`, see `src/server/platform/context.ts`),
  and a different audit table (`PlatformAuditLog` vs the per-school
  `AuditLog`), so a platform session can never be confused with, or escalate
  into, a tenant session.
- **One role, no capability matrix.** Unlike `STAFF_ROLES`
  (`admin`/`organiser`), there's exactly one platform role today, so
  `platformAdminService.ts` has no `requireCapability`-style gate — any
  authenticated `PlatformContext` may do everything the layer supports, which
  is intentionally narrow (create schools/admins, view usage counts).
- **View-only usage data is counts only.** `getSchoolUsageCounts` in
  `schoolRepository.ts` returns aggregate `count()`s only (staff, pupils,
  guardians, events, published events, current consent responses) — no row
  content from any tenant table is ever read by the platform layer.
- **Bootstrapping mirrors the existing pattern.** There is no self-service
  platform signup either. The first platform user is created with
  `scripts/bootstrap-platform-user.ts`, which mirrors
  `scripts/bootstrap-admin.ts`'s shape exactly (refuses to run if the email
  already exists; sets a real password directly, no invite-acceptance step):

  ```powershell
  npx tsx scripts/bootstrap-platform-user.ts `
    --name "Jane Smith" `
    --email "jane.smith@consapass.co.uk" `
    --password "a-strong-password-you-choose"
  ```

  Afterwards, sign in at `/platform/login`.

### Routes and pages

| Path | Purpose |
| --- | --- |
| `/platform/login`, `POST /api/platform/auth/login` | Platform sign-in. |
| `POST /api/platform/auth/logout` | Platform sign-out. |
| `/platform`, `GET`/`POST /api/platform/schools` | Dashboard: list every school with usage counts; create a school + its first admin. |
| `/platform/schools/[id]`, `GET /api/platform/schools/[id]` | Single school's usage detail. |
| `POST /api/platform/schools/[id]/admins` | Add an admin to an existing school (e.g. a school locked out of all its admin accounts). |

## What Phase 8 delivers (complete — all 4 slices)

Phase 8 is the HTTP API + UI layer that every prior phase's services have been
waiting for. It was built and reviewed in four slices; all four are now done.

**Slice 4 (this update): CSV import UI + staff management UI.**

- **API routes:** `POST /api/imports/validate` (preview, writes nothing),
  `POST /api/imports/commit` (all-or-nothing), `GET/POST /api/staff`,
  `PATCH /api/staff/[id]`, `POST /api/staff/[id]/deactivate`.
- **Pages:** `/imports` (paste/upload CSV, check-for-errors preview showing
  per-row messages without echoing values, then commit, with a downloadable
  template link) and `/staff` (list with per-row role change and deactivate —
  deactivation requires an explicit confirmation — plus an invite form).
  A shared `StaffNav` now links Events / Import roster / Staff / Sign out
  across every staff page.
- **A real gap found and deliberately NOT worked around at the time:** while
  scoping this slice, inviting a staff member turned out to be a dead end —
  `inviteStaff` creates an account with `status: "invited"` and no password,
  but the only function that activates one (`activateWithPassword`) takes no
  session context and has **no capability check at all**. It's test-only
  scaffolding, never meant to be reachable over HTTP. Rather than either skip
  staff UI entirely or expose that function insecurely, this slice shipped the
  list/invite/role/deactivate UI (all safe, already properly RBAC'd) and left
  activation as an honest, visible gap.
  **This gap is now closed** — see "Staff invite-acceptance flow" above.
- **Verification:** typecheck, build, and the full test suite (94 tests,
  unaffected) pass. Manually verified end-to-end against a running dev server:
  CSV validate with a missing field (error, no value echoed) → fixed → commit
  (created 1 pupil/guardian/class, 1 relationship) → both new pages render →
  invite a staff member (201, `invited`) → the honest gap-note appears on
  `/staff` → change their role (200) → deactivate them (200) → attempting to
  deactivate one's own account is rejected (400). All fixtures were cleaned up
  afterward.

**Slice 3: the parent consent page.** This is the page a real
parent actually sees — no account, a single opaque token in the URL.

- **API route:** `GET/POST /api/consent/[token]` — token-scoped only, no staff
  session involved. Identity comes entirely from server-side token validation
  (`consentService`), never from the URL beyond the opaque token itself.
- **Page:** `/c/[token]` renders one of four states depending on what the token
  resolves to: the consent form (radio buttons for granted/declined, optional
  notes, works without JS via a Server Action), an "already responded"
  message (when a current response exists and editing is disabled — the
  default), a "deadline passed" / "event cancelled" message, or — for any
  invalid, expired, revoked, or unknown token — a single **safe, generic**
  message directing the parent to contact the school. All of these render with
  a normal 200 page status; only the underlying API route distinguishes
  success from failure with HTTP status codes.
- **Known gap carried forward from the service layer:** there is no
  self-service "request a new link" flow. Reissuing a token is currently a
  staff-initiated action (`secureLinkService.reissueLink`, needs
  `event.manage`) with no UI yet. The invalid-link page reflects this honestly
  — it tells the parent to contact the school rather than promising a
  self-service option that doesn't exist.
- **Verification:** typecheck, build, and the full test suite (94 tests,
  unaffected) pass. Manually verified end-to-end against a running dev server
  using a seeded pupil/guardian/published-event/token fixture (created and
  torn down by one-off scripts, not committed): viewing the page and the API
  route both return the correct event/pupil scoping; submitting "granted"
  succeeds and is reflected on reload as "already responded"; a second
  submission attempt correctly returns 409 (editing disabled by default); and
  an invalid token renders the safe generic message on the page (200) while
  the API returns 401.

**Slice 2 (previous update): staff event management UI + API.**

- **API routes:** `GET/POST /api/events`, `GET/PATCH /api/events/[id]`,
  `POST /api/events/[id]/{publish,cancel,complete}`,
  `GET /api/events/[id]/dashboard`, `GET /api/events/[id]/responses?filter=`,
  `GET /api/events/[id]/export` (CSV file download), `GET /api/classes`. Every
  route is a thin wrapper over the existing, already-tested services — no new
  business logic lives in the HTTP layer.
- **Pages:** `/events` (list with status/dates), `/events/new` (accessible
  create form — real labels, `aria-live` errors, works without JS via a Server
  Action), `/events/[id]` (event detail, consent totals, a filterable response
  table, a CSV export link, and publish/complete/cancel actions). Cancelling is
  destructive (revokes parent links, suppresses reminders) so it requires an
  explicit "are you sure" confirmation step, not a single click.
- **Known limitation introduced this slice:** the create-event form uses
  `datetime-local` inputs, which are interpreted in the *browser's* local time,
  not the school's configured timezone. Fine for a single-timezone UK pilot;
  worth revisiting if that assumption changes.
- **Verification:** typecheck, build, and the full test suite (94 tests, all
  pre-existing service-level coverage, unaffected) all pass. Additionally
  verified the full HTTP lifecycle manually against a running dev server:
  login → create (201, draft) → detail page renders correctly → publish (200,
  status → published) → dashboard totals → CSV export (correct
  `Content-Type`/`Content-Disposition`/header row) → cancel (200, status →
  cancelled) → cancelling again correctly returns 409 → list page reflects the
  final state → an unauthenticated request to the API returns 401.

**Slice 1 (previous update): HTTP session + staff login.**

- **Cookie-based staff sessions:** `src/server/http/session.ts` wraps the
  existing `authService` with an HttpOnly, `SameSite=Lax` session cookie
  (`sc_session`). The cookie holds only the opaque session token — identity and
  tenant are always re-derived server-side from the stored session record,
  never trusted from anywhere else in the request.
- **`loginByEmail`:** staff login was tenant-scoped by `schoolId` (correct, and
  unchanged for existing callers). Since there's no school picker in the UI
  yet, `authService.loginByEmail` resolves the tenant from the email itself —
  if the email is active in exactly one school, that's the login target; a
  match in zero or more than one school returns the same generic failure as a
  wrong password, so no account/tenant existence is revealed.
- **Routes:** `POST /api/auth/login`, `POST /api/auth/logout` (the latter
  supports both a JSON caller and a plain HTML form post, redirecting to
  `/login` in the latter case).
- **Pages:** `/login` (an accessible, progressively-enhanced Server Action
  form — real `<label>`s, an `aria-live` error region, works without
  JavaScript) and a placeholder `/events` page that proves the session actually
  authenticates a page load and offers a sign-out button.
- Verified with both automated tests (`tests/login-by-email.test.ts`) and a
  manual end-to-end pass against a running dev server: login sets the cookie,
  the cookie authenticates `/events`, logout clears it, a subsequent request
  redirects to `/login`, and a wrong password returns a generic 401.

**Phase 8 is now complete.** The remaining known gaps (invite-acceptance
self-service, parent-side link reissue, real email, production datastore,
worker deployment, rate limiting) are tracked in `PILOT_READINESS.md`.

## What Phase 7 delivers

Phase 7 is a hardening pass over Phases 1–6 — no new product features, per the
roadmap (spec Section 15, step 8: "audit logging, security testing,
accessibility, and operational monitoring").

- **Audit coverage review:** confirmed every required action across FR-01–FR-10
  is logged (full list below). Found and closed one gap: school policy
  settings (consent editing / late / offline flags) had no audited way to
  change them — added `schoolSettingsService.updateSchoolSettings`, admin-only
  via a new `school.manage_settings` capability, audited as
  `school.settings_updated`.
- **Operational monitoring:** `monitoringService.listFailedNotificationsForSchool`
  surfaces failed notification deliveries with attempt counts and whether
  retries are exhausted (Section 11 Reliability).
- **[SECURITY_AND_PRIVACY_CHECKLIST.md](./SECURITY_AND_PRIVACY_CHECKLIST.md):**
  a checklist grounded in the actual implementation — what's done, with
  pointers to the code and tests that prove it, and what's explicitly not done
  yet (rate limiting, encryption-at-rest config, CI scanning, a real audit).
- **[ACCESSIBILITY_CHECKLIST.md](./ACCESSIBILITY_CHECKLIST.md):** forward
  guidance for whoever builds the UI layer, since no UI exists yet. Not a
  completed review.
- **[PILOT_READINESS.md](./PILOT_READINESS.md):** a plain statement of what's
  implemented vs. what's still missing before any real school pilot — most
  importantly, **there is still no HTTP API or UI layer**.

### Audit actions currently recorded

`staff.login`, `staff.logout`, `staff.invited`, `staff.activated`,
`staff.deactivated`, `staff.role_changed`, `class.created`, `pupil.created`,
`guardian.created`, `relationship.linked`, `data.imported`, `event.created`,
`event.updated`, `event.published`, `event.cancelled`, `event.completed`,
`link.reissued`, `consent.submitted`, `consent.updated`,
`register.exported`, `notification.sent`, `school.settings_updated`.

## What Phase 6 delivers

- **Notification model + async queue (FR-08):** a `Notification` record per
  scheduled message, drained by a worker. No message bodies or child PII are
  stored. Idempotency is guaranteed by a unique `dedupeKey` plus a status guard,
  so retried or concurrent runs never double-send.
- **Reminder scheduling (FR-06/FR-07):** publishing an event schedules a consent
  request (now), deadline reminders (default 7/3/1 days before the deadline),
  and an event reminder (default 1 day before the event) for each recipient.
- **Send-time eligibility:** deadline reminders go only to recipients still
  outstanding and only while the deadline is in the future; event reminders go
  only to recipients whose current consent is granted. Cancelling an event
  suppresses pending notifications and revokes links.
- **Email via a provider interface:** an `EmailProvider` abstraction with an
  in-memory mock adapter for dev/tests, plus a real Resend adapter for
  production (`src/server/notifications/providers/resend.ts`).
  Accessible plain-text templates carry a secure link where action is needed and
  **never include child personal data** in the subject or body (Section 11).
  Secure links are issued fresh at send time.
- **Delivery status + retry:** sends record a provider message id; failures
  record a short machine code and stay retryable and visible.
- Tests cover idempotent no-double-send, deadline/event eligibility,
  cancellation suppression, no child PII in emails, and failure handling.

See [Notifications & queue](#notifications--queue) for how the worker runs.

## What Phase 5 delivers

- **Consent dashboard (FR-05):** per-event totals — invited, consented,
  declined, outstanding — derived consistently from stored recipients and their
  current responses, so the counts always reconcile
  (consented + declined + outstanding = invited). A corrected response counts
  once (current state only).
- **Filterable response list:** the per-event recipient list with a status
  filter (all / consented / declined / outstanding), joined to pupil, class,
  and guardian for display.
- **Consent register export (FR-09):** authorised staff export a CSV with
  status and response timestamps. Export activity is audited (counts only,
  never the exported personal data), and the filename uses the event id rather
  than its title.
- Everything is tenant-scoped and gated by `event.view`. Tests cover totals
  reconciliation, corrected-response counting, filtering, CSV content/format,
  audit, RBAC, and tenant isolation.

The dashboard/export UI and HTTP API arrive in a later phase; Phase 5 is the
server-side services and tests.

## What Phase 4 delivers

- **Secure parent links (FR-04):** high-entropy (256-bit) tokens, each bound to
  a single school + event + pupil + guardian and action. Only the SHA-256 hash
  is stored; the raw token is returned once. Validation is entirely
  server-side, with expiry, revocation, and a single generic failure message so
  a link never reveals whether a record exists. Because identity comes only
  from the token, a parent cannot reach another pupil by tampering with the URL.
  Publishing an event issues one link per recipient; cancelling revokes them;
  staff can safely reissue a link.
- **Consent responses (FR-03):** simple yes/no (decision 17.12). A parent with
  no account submits granted or declined and gets a confirmation. Consent is
  never inferred from silence, an opened link, or a sent reminder — viewing
  stores nothing. A declined response is distinct from no response.
- **Audit history:** corrections create a new `current` row and retain the prior
  one as `superseded`; nothing is destroyed. Editing/late/offline consent stay
  disabled by default (decisions 17.3–17.5) behind school settings.
- Tests cover token entropy/hashing, expiry/revocation, cross-school reissue
  rejection, safe link resolution, granted/declined capture, superseded
  history, no-consent-from-silence, and the resubmission/deadline/cancellation
  rules.

The parent-facing web pages and HTTP API arrive in a later phase; Phase 4 is the
server-side services and tests.

## What Phase 3 delivers

- Event model (`Event`, `EventRecipient`) with a status lifecycle:
  `draft → published → cancelled | completed`, enforced by a transition guard.
- Event services (create/edit/publish/cancel/complete) with RBAC (admins and
  organisers manage events), tenant scoping, and audit.
- **Coherent date validation** (FR-02): event end after start, and consent
  deadline on or before the event start; publish is refused once the deadline
  has passed.
- **Recipient generation at publish**: materialises one recipient per eligible
  pupil from that pupil's single primary-contact guardian (decision 17.2),
  optionally scoped to a class. Non-primary and unauthorised guardians are
  never included.
- Tests cover the transition matrix, date/deadline validation, publish
  recipient generation, terminal-state rules, RBAC, and tenant isolation.

Editing is restricted to draft events in this phase; editing a published event
(with recipient re-computation and change notices, Journey F) lands with the
notifications phase. UI/HTTP API for events also arrives later.

## What Phase 2 delivers

- School data model: `ClassGroup`, `Pupil`, `Guardian`, and the authorised
  `PupilGuardianRelationship` link — all tenant-scoped.
- Data management services (create/list) with RBAC + audit: admins manage and
  import data; organisers may view rosters only.
- **Primary-contact-only** enforcement (decision 17.2): at most one primary
  contact per pupil; setting a new one demotes the previous.
- **CSV roster import** (FR-10): validated preview with per-row errors before
  any write, all-or-nothing commit, idempotent matching (pupil by external
  reference, guardian by email within the school), cross-school prevention
  (data always lands in the actor's own school), and audit that records
  **counts only** — never raw file contents or personal data.
- See [CSV import](#csv-import) for the template and columns.
- Tests cover the CSV parser, import validation/preview, idempotency,
  all-or-nothing commit, cross-school prevention, RBAC, and the primary-contact
  rule.

The staff/parent UI and HTTP API for these features arrive in a later phase;
Phase 2 delivers the server-side services and tests.

## What Phase 1 delivers

- Multi-tenant model: `School` (tenant), `StaffUser`, `StaffSession`, `AuditLog`.
- Staff authentication: scrypt password hashing, server-side sessions (hashed
  tokens), login/logout, expiry and revocation.
- Role-based access control (`admin`, `organiser`) enforced **server-side** via
  an explicit capability matrix.
- Tenant isolation: every data-access method is scoped by `schoolId` derived
  from the verified session — never from client input.
- Append-only audit logging with sensitive-key stripping.
- Automated tests for tenant isolation, RBAC, token expiry/revocation, and audit.

Staff/parent UI, events, consent forms, secure parent links, dashboards, and
notifications arrive in later phases.

## Tech stack

- **Next.js 16** + **React 19** + **TypeScript**
- **Prisma 5** ORM
- **SQLite** for local dev/test; **PostgreSQL** is the production target (see
  [Database](#database))
- **Zod** validation
- **Vitest** tests
- Password hashing uses Node's built-in `crypto.scrypt` (no native dependency).

## Prerequisites

- Node.js 20+ (built and tested on Node 24).
- No database server required for local dev/test — SQLite is file-based.

## Setup

```bash
npm install
cp .env.example .env        # then edit values as needed
npx prisma generate
npx prisma migrate dev      # applies migrations to the SQLite dev database
npm run seed                # optional: synthetic demo data (no real PII)
```

`.env` is gitignored. `.env.example` contains variable **names and safe
placeholders only** — never commit real secrets (spec Section 18.7).

### Environment variables

| Name | Purpose |
| --- | --- |
| `DATABASE_URL` | Prisma datasource. Dev/test: `file:./dev.db`. Production: a `postgresql://` URL. |
| `SESSION_SECRET` | Secret for session handling (32+ random bytes). |
| `SESSION_TTL_SECONDS` | Session lifetime in seconds (default 28800 = 8h). |
| `PLATFORM_SESSION_TTL_SECONDS` | Platform (super-user) session lifetime in seconds (default 28800 = 8h) — see "Platform (super-user) layer" below. |
| `EMAIL_PROVIDER` | `mock` (default; sends nothing) or `resend` — see "Email provider configuration" above. |
| `RESEND_API_KEY` | Required when `EMAIL_PROVIDER=resend`. Secret; never commit a real value. |
| `EMAIL_FROM` | Required when `EMAIL_PROVIDER=resend`, e.g. `ConsaPass <no-reply@consapass.co.uk>`. Must be on a domain verified in Resend (SPF/DKIM). |
| `APP_BASE_URL` | Base URL used to build staff invite / parent secure links (default `http://localhost:3000`; production: `https://consapass.co.uk`). |
| `NODE_ENV` | `development` / `test` / `production`. |

## Common commands

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Next.js dev server (run manually in your terminal). |
| `npm run build` | Production build. |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm test` | Run the Vitest suite once, against whatever datasource provider `prisma/schema.prisma` is currently set to. |
| `npm run test:local` | Run the Vitest suite locally against SQLite, automatically and safely swapping the datasource provider for the run (see [Testing](#testing) below). |
| `npm run test:watch` | Watch mode (run manually). |
| `npm run prisma:migrate` | Create/apply a dev migration. |
| `npm run seed` | Seed synthetic demo data. |
| `npm run db:reset` | Reset the database (destructive; dev only). |

## Testing

`prisma/schema.prisma` is pinned to `provider = "postgresql"` on `main` (see
`HOSTING.md`), and there is no local Postgres server in this dev setup — so
running the plain `npm test` command locally will fail with a Prisma schema
validation error. Use:

```bash
npm run test:local
```

This runs `scripts/test-local.mjs`, which temporarily swaps the datasource
provider to `sqlite`, regenerates the Prisma client, runs the full suite, then
restores the schema to `postgresql` and regenerates again — safely, even if
the tests fail or the run is interrupted. It never commits the swap.

(`npm test` on its own is what CI/deploy environments with a real Postgres
`DATABASE_URL` would use — it's left as a plain `vitest run` deliberately.)

Tests run against a dedicated SQLite database (`prisma/test.db`) that is created
fresh via `prisma db push` in `tests/globalSetup.ts`, so they never touch
`dev.db`. All fixtures are **synthetic** — no real children's or guardians'
data (spec Section 18.4).

Covered (spec Section 18.6): tenant isolation, role permissions, session token
expiry/revocation, audit logging, the Phase 2 data layer (CSV parsing, import
validation/preview, idempotent and all-or-nothing commit, cross-school
prevention, primary-contact rule), and the Phase 3 event layer (status
transitions, date/deadline validation, publish recipient generation from
primary contacts), the Phase 4 consent/secure-link layer (token
entropy/hashing, expiry/revocation, cross-school rejection, consent status
transitions including superseded history, and no-consent-from-silence), Phase 5
dashboard/export, the Phase 6 notification layer (idempotent no-double-send,
deadline/event reminder eligibility, cancellation suppression, and no child PII
in emails), Phase 7 hardening (failed-notification monitoring, audited school
settings), Phase 8 slice 1 (email-based tenant resolution at login), the
staff invite-acceptance flow (token hashing, single-use consumption, expiry,
cross-school isolation), the email provider abstraction against a second,
realistic fake provider, data retention (default/configurable period,
current-response protection, tenant scoping, audit), and the rate limiter
(window behaviour, per-key isolation, reset). All required Section 18.6 test
areas are covered. The
HTTP layer itself (session cookies, route handlers, pages) was verified
manually end-to-end against a running dev server for all four Phase 8 slices
plus the invite-acceptance flow (see the notes above), since Next.js route
handlers, cookies, and token-scoped pages aren't easily unit-tested with
Vitest alone.

## CSV import

Roster import uses one row per pupil, capturing the pupil, their class, and
their single primary-contact guardian (decision 17.2). Columns (header names
are case-insensitive and order-independent):

| Column | Required | Notes |
| --- | --- | --- |
| `pupil_first_name` | yes | |
| `pupil_last_name` | yes | |
| `pupil_external_ref` | no | School's own reference; used for idempotent re-import matching. |
| `class_name` | yes | Created on first sight within the school. |
| `guardian_name` | yes | |
| `guardian_email` | yes | Matched within the school on re-import. |
| `relationship` | no | e.g. `Mother`, `Carer`. |

Import is a two-step flow: **validate** (returns a preview with per-row errors
and writes nothing) then **commit** (all-or-nothing; a single invalid row
aborts the whole import). Re-importing the same file is safe — existing pupils
(by `pupil_external_ref`) and guardians (by `guardian_email`) are matched, not
duplicated. A downloadable template is provided by `importTemplateCsv()`.

Raw CSV contents and personal values are never written to logs or the audit
trail (FR-10 / Section 11); audit entries hold operation counts only.

## Notifications & queue

Notifications are persisted as `Notification` rows and sent asynchronously by a
worker (`processDueNotifications`) that claims due rows, re-checks eligibility,
sends via the `EmailProvider`, and records delivery status. In this environment
there is no Redis, so the queue is **database-backed**: scheduling inserts rows
with a future `scheduledAt`, and the worker drains rows whose time has arrived.
Idempotency comes from a unique `dedupeKey` per (event, pupil, guardian, type,
slot) plus a status guard that never re-sends an already-sent row.

In a real deployment the worker would run on a timer (cron/interval, currently
a Render Cron Job — see `HOSTING.md`) or be swapped for a Redis-backed queue
(e.g. BullMQ) behind the same interface; the service API would not change.
Email uses a provider-agnostic interface: an in-memory **mock adapter** for
development and tests, and a **Resend adapter** for real delivery
(`EMAIL_PROVIDER=resend`, decision 17.8 — see "Email provider configuration"
above).

## Rate limiting

Sensitive endpoints are rate-limited via a fixed-window counter
(`src/server/http/rateLimit.ts`), applied per route in
`src/server/http/rateLimitGuard.ts`:

| Route | Limits |
| --- | --- |
| `POST /api/auth/login` | 10 requests / 5 min per IP |
| `GET/POST /api/consent/[token]` | 30 / 5 min per IP **and** 20 / 5 min per token |
| `GET/POST /api/accept-invite/[token]` | Same shape as consent tokens |
| `POST /api/staff` (invite) | 20 / 5 min per IP |

Exceeding a limit returns `429` with a generic message and a `Retry-After`
header — never a message that distinguishes rate-limiting from any other
failure. Token-scoped routes are limited **both** per-IP and per-token: per-IP
blunts a single source scanning many tokens, and per-token stops one
leaked/guessed token being hammered regardless of source IP (FR-04).

Like the notification queue, the limiter's state is an **in-process `Map`** —
effective for a single server instance (the only kind currently documented),
but not shared across a horizontally-scaled deployment. The `RateLimiter`
interface is storage-agnostic so a Redis-backed implementation can replace
`InMemoryRateLimiter` later without changing any call site. See
`SECURITY_AND_PRIVACY_CHECKLIST.md` for the full rate-limiting and CSRF
posture review, including what is and isn't covered.

## Database

Local dev and tests use **SQLite** because this environment has no Postgres or
Docker. The Prisma schema is intentionally **PostgreSQL-compatible** (no
SQLite-only features; enum-like fields are `String` columns validated in the
app layer). Moving to Postgres for a pilot is:

1. change the datasource `provider` to `postgresql` in `prisma/schema.prisma`,
2. set a `postgresql://` `DATABASE_URL`,
3. run `npx prisma migrate dev` to generate a fresh migration.

## Deployment assumptions (not yet configured)

- Container-friendly Node host, managed PostgreSQL, and (from the notifications
  phase) managed Redis for the job queue.
- Secrets provided via the platform's secret manager, never committed.
- TLS terminated at the platform edge (encryption in transit).

These are assumptions to be confirmed during technical discovery (spec
Section 15), not an implemented deployment.

## Known issues

- `npm audit` reports two **moderate, dev-only** advisories in the Vitest/esbuild
  toolchain (dev server request handling). They do not affect the application or
  CI test runs and are only resolvable by a breaking upgrade to Vitest 5, which
  is deferred. No runtime/production dependency is affected.

## Open decisions

Resolved so far: primary-contact-only notifications, simple yes/no consent,
late/edited/offline consent disabled, email provider (Resend), and brand
(ConsaPass). Remaining open items (pricing, SMIS integrations) are tracked in
`IMPLEMENTATION_PLAN.md` §9 and the spec §17.
