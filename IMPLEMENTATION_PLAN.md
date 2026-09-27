# SchoolConnect — Implementation Plan

**Status:** Planning only (no application code yet, per Section 19)
**Source of truth:** `school_consent_platform_kiro_spec.md`
**Repository state at time of writing:** empty except for the spec — this is a greenfield build.

This document delivers every item requested in Section 19:
architecture and rationale, folder structure, database schema and
relationships, UI route/page inventory, API endpoint inventory,
reminder scheduling and idempotency design, secure-link threat model,
test strategy, and open questions/assumptions.

---

## 1. Recommended architecture and rationale

### 1.1 Stack recommendation

| Concern | Recommendation | Rationale |
| --- | --- | --- |
| Runtime / framework | **Next.js (App Router) + TypeScript** | One codebase serves staff SPA-style pages, parent secure-link pages, and API routes. Server-side rendering keeps token validation and tenant checks on the server (Section 5.4, FR-04). Strong TS typing reduces data-model errors around consent state. |
| Database | **PostgreSQL** | Explicitly suggested in Section 9. Relational integrity is essential for tenant boundaries, guardian↔pupil authorisation, and consistent dashboard counts (FR-05). |
| ORM / migrations | **Prisma** | First-class TypeScript types, declarative migrations, and easy-to-audit schema. Enforces the data model in code. |
| Background jobs / scheduler | **BullMQ on Redis** (or a managed queue) behind an `Scheduler`/`Queue` interface | FR-06/FR-07 require durable, idempotent, retryable reminder jobs (Section 11 Reliability). A Redis-backed queue gives delayed jobs, retries with backoff, and dedupe via job IDs. |
| Email | **Provider-agnostic `EmailProvider` interface**, with a dev/mock adapter and one real adapter (e.g. a transactional provider) selected later | Section 17.8 leaves the provider open; Section 18.3 forbids real integrations without approval. An adapter keeps the provider swappable and lets us develop against a mock. |
| Auth (staff) | **Credential + session** (email/password with secure session cookies), pluggable to SSO later | Staff need accounts (FR-01); parents must not (5.3). Keep it simple and server-enforced. |
| Auth (parents) | **Hashed, high-entropy secure tokens** (no account) | FR-04. |
| Validation | **Zod** shared between client and server | Consistent input validation (Section 11 Security) and CSV field validation (FR-10). |
| Testing | **Vitest** (unit/integration) + **Playwright** (E2E) | Covers the required test areas in Section 18.6. |
| Hosting assumptions | Container-friendly Node host + managed Postgres + managed Redis | Keeps secrets in env/secret manager (Section 11). Documented as assumption, not committed. |

### 1.2 Architectural principles

- **Server-side tenant isolation as a hard rule.** Every query is scoped by `school_id`, derived from the authenticated session (staff) or the validated token (parent) — never from a client-supplied value. A repository/data-access layer centralises this so it can't be forgotten per-route.
- **Layered structure:** route handlers → application services (business rules) → repositories (tenant-scoped DB access) → Prisma. Business rules like "no response is not consent" live in services, not scattered in UI.
- **Consent state is append-friendly.** Responses keep a current/revoked state and prior responses are retained in audit history (FR-03, Section 10). Never mutate history destructively.
- **Notifications are always asynchronous and idempotent.** User-facing requests enqueue jobs; workers send. Dedupe keys prevent duplicate sends on retry (FR-08, Section 11).
- **Adapters for anything external.** Email and (future) SMIS integrations sit behind interfaces so development uses mocks (Section 18.3).
- **Data minimisation everywhere.** No child PII in URLs, email subjects, or logs (FR-04, FR-08, FR-10, Section 11).

---

## 2. Proposed folder structure

```
schoolconnect/
├─ .env.example                     # names + safe placeholders only (Section 18.7)
├─ README.md                        # setup, migrations, seed, tests, deploy assumptions
├─ docker-compose.yml               # local Postgres + Redis (dev only)
├─ prisma/
│  ├─ schema.prisma                 # data model (Section 9)
│  ├─ migrations/
│  └─ seed.ts                       # synthetic fixtures only (Section 18.4)
├─ src/
│  ├─ app/                          # Next.js App Router
│  │  ├─ (staff)/                   # authenticated staff area
│  │  │  ├─ login/
│  │  │  ├─ dashboard/
│  │  │  ├─ events/
│  │  │  ├─ classes/
│  │  │  ├─ pupils/
│  │  │  ├─ guardians/
│  │  │  ├─ imports/
│  │  │  ├─ reports/
│  │  │  └─ settings/
│  │  ├─ (parent)/
│  │  │  └─ c/[token]/              # secure parent consent/reminder pages
│  │  └─ api/                       # route handlers (see Section 5)
│  ├─ server/
│  │  ├─ auth/                      # staff sessions, RBAC guards
│  │  ├─ tenancy/                   # tenant-scope helpers/guards
│  │  ├─ services/                  # business rules (events, consent, reminders...)
│  │  ├─ repositories/              # tenant-scoped DB access
│  │  ├─ tokens/                    # secure-link generation, hashing, validation
│  │  ├─ notifications/
│  │  │  ├─ EmailProvider.ts        # interface
│  │  │  ├─ providers/mock.ts       # dev adapter
│  │  │  └─ templates/              # accessible email templates
│  │  ├─ jobs/                      # queue setup, workers, schedulers
│  │  ├─ csv/                       # import/export + validation
│  │  └─ audit/                     # audit-log writer
│  ├─ lib/                          # shared validation (Zod), utils
│  └─ types/
└─ tests/
   ├─ unit/
   ├─ integration/
   └─ e2e/
```

Rationale: `app/` route groups cleanly separate the authenticated staff
experience from the tokenised parent experience. All privileged logic
lives under `src/server`, keeping tenant/RBAC enforcement out of the UI
layer.

---

## 3. Database schema and relationships

Follows Section 9, with explicit constraints, indexes, and tenancy
added. All tables carry `school_id` (except `School`).

### 3.1 Entities

- **School** — `id (PK)`, `name`, `school_type` (state|independent), `settings (jsonb)`, `timezone`, `created_at`.
- **StaffUser** — `id`, `school_id (FK)`, `name`, `email`, `password_hash`, `role` (admin|organiser), `status` (active|invited|deactivated), `created_at`. Unique: (`school_id`, `email`).
- **ClassGroup** — `id`, `school_id (FK)`, `name`/`year_group`. Unique: (`school_id`, `name`).
- **Pupil** — `id`, `school_id (FK)`, `class_group_id (FK)`, minimal identifying fields, `status`.
- **Guardian** — `id`, `school_id (FK)`, `name`, `email`, `status`. Unique: (`school_id`, `email`).
- **PupilGuardianRelationship** — `id`, `school_id (FK)`, `pupil_id (FK)`, `guardian_id (FK)`, `relationship`, `is_authorised` (bool), `is_primary_contact` (bool). Unique: (`school_id`, `pupil_id`, `guardian_id`). **Only the primary contact is notified / may consent** (17.2 resolved); enforce at most one primary contact per pupil. **Source of authorised relationships** — Section 9 warns not to assume every guardian is authorised.
- **Event** — `id`, `school_id (FK)`, `title`, `description`, `location`, `starts_at`, `ends_at`, `consent_deadline`, `status` (draft|published|cancelled|completed), `created_by (FK StaffUser)`, `created_at`, `updated_at`.
- **EventRecipient** — `id`, `school_id (FK)`, `event_id (FK)`, `pupil_id (FK)`, `guardian_id (FK)`, `invitation_status`, `eligibility_metadata`. Unique: (`school_id`, `event_id`, `pupil_id`, `guardian_id`).
- **ConsentForm** — `id`, `school_id (FK)`, `event_id (FK)`, `schema (jsonb)`, `version`, `published_at`.
- **ConsentResponse** — `id`, `school_id (FK)`, `event_id (FK)`, `pupil_id (FK)`, `guardian_id (FK)`, `response` (granted|declined), `submitted_at`, `form_version`, `notes` (optional), `state` (current|superseded|revoked). New rows for corrections; prior rows kept (FR-03).
- **SecureAccessToken** — `id`, `school_id (FK)`, `event_id (FK)`, `guardian_id (FK)`, `pupil_id (FK)`, `token_hash`, `scope`, `permitted_action`, `expires_at`, `revoked_at`, `created_at`, `last_used_at`. Store hash, not raw token (FR-04).
- **Notification** — `id`, `school_id (FK)`, `event_id (FK)`, `guardian_id (FK)`, `pupil_id (FK)`, `type` (consent_request|deadline_reminder|event_reminder|change_notice|confirmation), `dedupe_key` (unique), `scheduled_at`, `status` (scheduled|queued|sent|failed|cancelled), `provider_message_id`, `sent_at`, `failure_code`. No sensitive payload stored.
- **AuditLog** — `id`, `school_id (FK)`, `actor_type`, `actor_id`, `action`, `entity_type`, `entity_id`, `timestamp`, `metadata (jsonb, minimal)`.

### 3.2 Key relationships

- School 1—* everything (tenant root).
- Pupil *—* Guardian via PupilGuardianRelationship (authorisation lives here).
- Event 1—* EventRecipient, 1—1/1—* ConsentForm (versioned), 1—* ConsentResponse.
- Event/Guardian/Pupil 1—* Notification and 1—* SecureAccessToken.

### 3.3 Constraints, indexes, retention

- **Indexes:** `school_id` on all tenant tables; composite index on `Notification(status, scheduled_at)` for the scheduler; `ConsentResponse(event_id, pupil_id, guardian_id, state)`; unique `Notification(dedupe_key)`; unique `SecureAccessToken(token_hash)`.
- **Uniqueness:** as listed per entity above.
- **Retention:** configurable retention/deletion job for tokens, notifications, and audit entries (Section 11) — parameters are an open decision (17.9).

---

## 4. UI route / page inventory

### 4.1 Staff (authenticated, tenant-scoped)

| Route | Page | Notes |
| --- | --- | --- |
| `/login` | Staff sign-in | Section FR-01 |
| `/dashboard` | School overview / events list | Outstanding responses easy to spot (Section 11) |
| `/events` | Event list | filter by status |
| `/events/new` | Create event | Journey A |
| `/events/[id]` | Event detail + consent dashboard | FR-05 totals |
| `/events/[id]/edit` | Edit / cancel event | Journey F |
| `/events/[id]/recipients` | Recipient list, filter, send manual reminder | FR-05/FR-06 |
| `/events/[id]/report` | Consent register + CSV export | FR-09 |
| `/classes` | Class/year-group management | FR-01 |
| `/pupils` | Pupil records | data minimisation |
| `/guardians` | Guardian records + relationships | authorisation mgmt |
| `/imports` | CSV import with preview + validation errors | FR-10 |
| `/settings/staff` | Invite/deactivate staff, roles | FR-01 |
| `/settings/reminders` | School-level reminder defaults | FR-06/FR-07 |
| `/settings/school` | School profile, timezone | DST handling (Section 10) |

### 4.2 Parent (tokenised, no account)

| Route | Page | Notes |
| --- | --- | --- |
| `/c/[token]` | Event + consent form | Server validates token/scope first (Journey B) |
| `/c/[token]/confirm` | Submission confirmation | FR-03 |
| `/c/[token]/invalid` | Safe message for expired/revoked/used links + request-new-link route | Section 10, FR-04 |

---

## 5. API endpoint inventory

All staff endpoints require an authenticated session and are tenant-scoped server-side; all parent endpoints require a valid token validated server-side.

### 5.1 Auth & staff admin
- `POST /api/auth/login`, `POST /api/auth/logout`
- `POST /api/staff/invite`, `POST /api/staff/:id/deactivate`, `PATCH /api/staff/:id/role`

### 5.2 Data management
- `GET/POST /api/classes`, `GET/POST /api/pupils`, `GET/POST /api/guardians`
- `POST /api/relationships` (pupil↔guardian authorisation)
- `POST /api/imports/validate` (preview + errors), `POST /api/imports/commit`
- `GET /api/exports/events/:id/register.csv`

### 5.3 Events
- `GET/POST /api/events`, `GET/PATCH /api/events/:id`
- `POST /api/events/:id/publish`, `POST /api/events/:id/cancel`
- `GET /api/events/:id/dashboard` (derived counts)
- `GET /api/events/:id/recipients`, `POST /api/events/:id/reminders/manual`

### 5.4 Consent forms
- `GET/PUT /api/events/:id/form`

### 5.5 Parent (token-scoped)
- `GET /api/consent/:token` (validated event + form)
- `POST /api/consent/:token/respond` (granted|declined; rate-limited)
- `POST /api/links/reissue` (safe reissue flow)

### 5.6 Internal (jobs/webhooks)
- Email provider delivery webhook → updates `Notification.status` (guarded/signed).

---

## 6. Reminder scheduling and idempotency design

### 6.1 Scheduling model

- On **event publish**: create `EventRecipient` rows for authorised guardians, send the initial consent request, and pre-compute `Notification` rows (status `scheduled`) for each configured deadline reminder offset (default 7/3/1 days — FR-06, configurable) and the event reminder (default 1 day before — FR-07, configurable). Timezone-aware using the school's configured timezone with DST handling (Section 10).
- A **scheduler tick** (recurring worker) selects due `Notification` rows (`status=scheduled AND scheduled_at <= now`) and enqueues them.

### 6.2 Eligibility checks at send time (not just at schedule time)

- **Deadline reminders:** send only if event is `published`, deadline not passed, and the recipient's current response is still outstanding. If a response arrived first, mark the notification `cancelled` (FR-06, Journey D).
- **Event reminders:** send only to recipients whose **current** consent is `granted`; re-check at send time because consent may have been revoked (FR-07, Section 10).
- **Cancelled/changed events:** cancel obsolete notifications and recalculate scheduled ones; send change/cancellation notices (Journey F, Section 10).

### 6.3 Idempotency

- Each notification has a deterministic **`dedupe_key`** = hash of (`event_id`, `guardian_id`, `pupil_id`, `type`, `scheduled_slot`). Unique constraint prevents duplicate rows.
- Queue **job IDs** reuse the `dedupe_key`, so a re-enqueue is a no-op.
- Workers use a state transition guard (`scheduled/queued → sent`) so a retried job that already sent won't send again.
- Retries use bounded exponential backoff; exhausted jobs move to `failed` and become visible to admins (Section 11 Reliability).

---

## 7. Secure-link threat model (FR-04)

| Threat | Mitigation |
| --- | --- |
| Token guessing / brute force | High-entropy (≥128-bit) random tokens; store only `token_hash`; rate-limit `/api/consent/*`; generic responses that don't reveal whether a record exists. |
| Enumeration via URL tampering (viewing another pupil) | Token is bound to a specific `guardian_id`, `pupil_id`, `event_id`, and action; server rejects any mismatch; no IDs in the URL are trusted. |
| PII leakage in links | No pupil names/contact data in URLs (FR-04); opaque token only. |
| Replay of expired/revoked/used links | `expires_at`, `revoked_at`, and action checks server-side; safe `/c/[token]/invalid` page with a reissue route. |
| Token theft via referrer/logs | Don't log raw tokens; use `Referrer-Policy`; hash at rest. |
| CSRF on submission | Server-side validation, appropriate anti-CSRF handling on the POST, and token binding. |
| Cross-tenant access | `school_id` derived from the token, never client input; repository layer enforces scope. |
| Elevated-risk actions | Optional additional identity verification for sensitive info (FR-04) — flagged as open/config. |

---

## 8. Test strategy

Mapped to Section 18.6 required areas:

- **Tenant isolation** — integration tests proving School A cannot read/write School B data via any service/repository or API route.
- **Role permissions** — organiser vs admin capability matrix; server rejects unauthorised actions.
- **Token expiry/revocation** — expired, revoked, already-used, and mismatched-scope tokens are rejected; valid tokens succeed.
- **Consent status transitions** — outstanding → granted/declined; correction/resubmission per policy; prior response retained; "silence is not consent" enforced.
- **Reminder eligibility** — deadline reminders skip responded/past-deadline; event reminders only to currently-consented; revocation updates eligibility.
- **Cancellation / date-change handling** — obsolete notifications cancelled/recalculated; affected recipients notified.
- **Idempotent notification jobs** — duplicate/retried jobs never double-send (dedupe key + state guard).
- **CSV import** — validation errors shown pre-commit; cross-school import prevented; raw contents not logged.
- **E2E (Playwright)** — Journeys A–F end-to-end, including mobile viewport (accessibility/usability, acceptance criterion 14).

Tests use **synthetic fixtures only** — no real children's data (Section 18.4). Email uses the mock provider so no real sends occur in tests.

---

## 9. Open questions and assumptions

### 9.0 Resolved decisions (confirmed by product owner)

- **Guardian rules (17.2): Only the primary contact is notified.** Exactly one guardian per pupil is flagged as primary contact and receives all notifications; consent is captured from the primary contact. This removes multi-guardian conflict handling from MVP scope.
- **Consent form scope (17.12): Simple yes/no only.** MVP supports a single granted/declined response with optional notes; no additional question types.
- **Late / edited / offline consent (17.3–17.5): Disabled.** These remain behind school-configurable policy flags defaulting to disabled; not part of MVP behaviour until explicitly enabled.
- **Reminder defaults (17.6) & event reminder timing (17.7): confirmed as implemented.** Deadline reminders at 7/3/1 days before the deadline; event reminder 1 day before the event. Both configurable per school (currently the offsets themselves are code constants — `DEFAULT_DEADLINE_REMINDER_OFFSET_DAYS`/`DEFAULT_EVENT_REMINDER_OFFSET_DAYS` in `domain.ts` — school-level override of the *offsets* is not yet built; only the editing/late/offline *policy flags* are per-school today).
- **School management systems to integrate (17.1): deferred.** Left open for a later iteration/discovery phase, as originally scoped in the spec (Section 12 Phase 2). No integration work is in progress.
- **Email provider/domain (17.8): kept configurable, tested as if configured.** No specific vendor or sending domain is selected. `EMAIL_PROVIDER` env var selects the implementation (`src/server/notifications/EmailProviderConfig.ts`); `mock` is the default and only implemented option, and selecting a real provider name before it's built fails loudly rather than silently no-op'ing. Real adapters (SMTP, a hosted transactional API) are placeholders pending vendor selection. Tests exercise the full send path against a second, more realistic fake HTTP-style provider (`tests/fixtures/fakeHttpEmailProvider.ts`) with simulated latency and vendor-shaped failure codes, so the abstraction is proven against more than the trivial mock — see `tests/email-provider-config.test.ts`.
- **Data retention (17.9): 3 years by default, configurable per school.** `SchoolSettings.dataRetentionYears` (default 3, bounded 1–10). `retentionService` provides an admin-only, audited preview and sweep; nothing runs it automatically yet (no background worker deployed — same status as `processDueNotifications`). The sweep never deletes a pupil's/guardian's *current* consent response, only superseded corrections and terminal notifications/audit-log rows past the cutoff.
- **Pricing and pilot terms (17.10): deferred to a later iteration**, to be decided closer to production deployment, per the product owner.
- **Brand (17.11): flagged as a real conflict, not resolved as "keep."** A web search for existing use turned up at least two live, published apps already trading as "SchoolConnect" in the same school-parent-communication space: [SchoolConnect on Google Play](https://play.google.com/store/apps/details?id=com.SchoolConnect.app) and [SchoolConnect ("School Staff") on the App Store](https://apps.apple.com/us/app/school-staff/id6477534537). This wasn't a request to check formal registration (no interactive UK IPO/USPTO register search was available), but existing commercial use of the same name in the same market is itself a real trademark/brand-collision risk regardless of registration status. **Recommendation: treat the name as still open and pick something distinct before a real pilot.** See `PILOT_READINESS.md`.

*Resolved: guardian rules (17.2), consent form scope (17.12), late/edited/offline consent (17.3–17.5), reminder defaults (17.6/17.7), integration priority deferred (17.1), email provider configurable (17.8), data retention default+configurable (17.9), pricing deferred (17.10), brand flagged not resolved (17.11) — see above.*

### 9.2 Working assumptions (isolated and documented until confirmed, per Section 18.9)

- Stack: Next.js + TypeScript + PostgreSQL + Prisma + BullMQ/Redis, pending objection.
- One consent response type for MVP: yes/no (granted/declined) with optional notes.
- Only the **primary-contact** guardian per pupil is notified and may submit consent (17.2 resolved).
- Default reminder offsets 7/3/1 days; event reminder 1 day before — all configurable.
- Late/edited/offline consent are gated behind school-configurable policy flags, **defaulting to disabled** (17.3–17.5 resolved).
- Email developed against a mock adapter only; no real provider wired until 17.8 + approval.
- **Local dev/test datastore:** the environment has no Postgres/Docker, so Phase 1 uses **SQLite via Prisma** for local development and tests, with a schema kept Postgres-compatible (avoiding SQLite-only features). Production remains PostgreSQL (Section 9). `DATABASE_URL` selects the datastore; switching to Postgres for a pilot requires only the provider + URL change and a re-migration.

---

## 10. Suggested phased implementation (post-approval)

Aligned with Section 15 and Section 18.5 (small, reviewable phases; tests + report after each):

1. **Foundation:** project scaffold, Prisma schema + migrations, tenant + staff auth + RBAC, audit-log writer. (Section 19 explicitly names this as the starting milestone.)
2. **Data + CSV import:** classes, pupils, guardians, relationships, validated CSV import with preview.
3. **Events:** create/edit/publish/cancel with coherent date/deadline validation.
4. **Consent + secure links:** consent form, token generation/validation, parent pages, response capture.
5. **Dashboard + exports:** FR-05 counts, consent register CSV.
6. **Notifications + scheduler:** email templates, queue, deadline reminders, event reminders, idempotency, change/cancellation notices.
7. **Hardening:** audit coverage, security + accessibility testing, monitoring, pilot onboarding docs.

### Progress

- **Phase 1 — done.** Tenant model, staff auth (scrypt, hashed sessions, expiry/revocation), server-side RBAC, tenant isolation, and audit logging, with tests. See `README.md`.
- **Phase 2 — done.** School data layer (`ClassGroup`, `Pupil`, `Guardian`, `PupilGuardianRelationship`) with primary-contact-only enforcement, plus validated CSV roster import (preview + errors, all-or-nothing idempotent commit, cross-school prevention, counts-only audit). Tests cover the parser, validation, idempotency, cross-school prevention, RBAC, and the primary-contact rule.
- **Phase 3 — done.** Events (`Event`, `EventRecipient`) with a `draft → published → cancelled | completed` lifecycle, coherent date/deadline validation, and publish-time recipient generation from each pupil's primary-contact guardian. Tests cover transitions, date validation, recipient generation, RBAC, and tenant isolation.
- **Phase 4 — done.** Secure parent links (`SecureAccessToken`) — 256-bit tokens, hash-only storage, server-side validation with expiry/revocation, recipient binding, safe reissue, and revoke-on-cancel — plus yes/no consent (`ConsentResponse`) with confirmation, superseded audit history, no-consent-from-silence, and default-off editing/late/offline policies. Tests cover token security, link resolution, and consent capture rules.
- **Phase 5 — done.** Consent dashboard (per-event invited/consented/declined/outstanding totals that reconcile, derived from stored records), filterable response list, and consent register CSV export (authorised, audited counts-only, minimal PII). Tests cover totals reconciliation, filtering, export format, RBAC, and tenant isolation.
- **Phase 6 — done.** Notifications (`Notification`) with a DB-backed async queue, mock `EmailProvider`, accessible no-child-PII templates, deadline reminders (7/3/1d) and event reminders (1d) scheduled on publish, send-time eligibility (outstanding-only / consented-only), cancellation suppression, idempotent no-double-send (dedupe key + status guard), and delivery-status/retry tracking. Tests cover idempotency, eligibility, suppression, PII-safety, and failures.
- **Phase 7 — done.** Hardening pass: reviewed audit coverage and closed one gap (audited, admin-only school policy settings); added failed-notification monitoring; wrote `SECURITY_AND_PRIVACY_CHECKLIST.md`, `ACCESSIBILITY_CHECKLIST.md` (forward guidance), and `PILOT_READINESS.md` (plain statement of what's missing). No product features added — matches the roadmap's Section 15 step 8.
- **Phase 8 — in progress (slice 1 of 4 done).** HTTP API + staff/parent UI layer, built in reviewable slices given its size:
  - **Slice 1 (done):** cookie-based staff sessions (`src/server/http/session.ts`), `authService.loginByEmail` (resolves tenant from email since there's no school picker yet), `/api/auth/login`, `/api/auth/logout`, an accessible `/login` page, and a placeholder `/events` page. Verified with tests plus a manual end-to-end HTTP pass.
  - **Slice 2 (done):** event list (`/events`), create form (`/events/new`), detail/dashboard page (`/events/[id]` — totals, filterable response table, CSV export link, publish/complete/cancel actions with confirmation on cancel), and the API routes behind them (`/api/events`, `/api/events/[id]`, `/api/events/[id]/{publish,cancel,complete,dashboard,responses,export}`, `/api/classes`). Verified with the full test suite plus a manual end-to-end HTTP pass covering the whole event lifecycle. Known limitation: date inputs use the browser's local time, not the school's configured timezone.
  - **Slice 3 (done):** parent consent page (`/c/[token]`) and `GET/POST /api/consent/[token]`, token-scoped only (no staff session). Four page states: form, already-responded, deadline-passed/cancelled, and a single safe generic message for any invalid/expired/revoked token. Verified with tests plus a manual end-to-end HTTP pass covering view, submit, resubmit-rejected, and invalid-token cases. Known gap: no self-service "request new link" — reissue remains staff-initiated with no UI, and the invalid-link page says so honestly (contact the school) rather than promising something that doesn't exist.
  - **Slice 4 (done):** CSV import UI (`/imports`, two-step validate→commit) and staff management UI (`/staff`, list/invite/role-change/deactivate), plus their API routes. A real gap was found while scoping this slice — `activateWithPassword` has no session context or capability check, so it's unsafe to expose over HTTP as-is — and deliberately not worked around; the UI is honest about it (a visible note when any staff member is `invited`) rather than either skipping staff management or exposing an insecure activation endpoint. Closing it properly needs an invite-acceptance token, the same pattern as `SecureAccessToken`. Verified with tests plus a manual end-to-end HTTP pass (import with an error → fixed → committed; invite → role change → deactivate → self-deactivation blocked).
- **Phase 8 is complete (all 4 slices).**
- **Staff invite-acceptance flow — done.** Added `InviteToken` (mirroring `SecureAccessToken`: hashed, single-use, 7-day expiry), `inviteAcceptanceService.acceptInvite` as the sole HTTP-reachable activation path (password validated before token consumption, so a mistaken attempt doesn't waste the link), `/accept-invite/[token]` + its API route, and token issuance wired into both the staff API route and the `/staff` invite form (the link is surfaced directly to the admin since there's still no real email provider). `activateWithPassword` is untouched and now explicitly documented as internal/test/seed-only. 14 new tests (108 total), typecheck, build, and a full manual end-to-end HTTP pass (invite → accept → login as the new account, reuse rejected) all verified.
- **Remaining open spec decisions resolved — done.** Reminder defaults/timing confirmed as implemented; integration priority and pricing explicitly deferred; email provider kept configurable with tests exercising the abstraction against a realistic fake HTTP provider; data retention defaulted to 3 years and made per-school configurable with an admin-only audited preview/sweep service (`retentionService`); brand name flagged as a genuine collision risk (two existing live "SchoolConnect" apps found) rather than resolved as "keep." See §9.0 above. 16 new tests (124 total), typecheck, and build all verified.
- **Rate limiting — done.** Fixed-window limiter (`src/server/http/rateLimit.ts`) applied to `/api/auth/login` (10/5min per IP), `/api/consent/[token]` and `/api/accept-invite/[token]` (per-IP + per-token, since these are token-guessing risks), and `/api/staff` invite (per-IP, abuse throttling). Reviewed and documented CSRF posture (Server Actions get Next's built-in Origin-header protection; `/api/*` routes rely on `SameSite=Lax` + JSON content-type + POST/PATCH-only mutations, with an explicit residual-gap note rather than a false "done"). 6 new unit tests plus a full manual end-to-end HTTP verification (429 after threshold, correct `Retry-After`, per-route and per-token isolation confirmed). See `SECURITY_AND_PRIVACY_CHECKLIST.md` for the full review.
- Remaining gaps are tracked in `PILOT_READINESS.md`: no self-service parent link reissue, no real email provider implementation (config point exists, no vendor selected), no scheduled retention sweep or notification worker (both exist as callable functions awaiting a deployed scheduler), no production datastore, no explicit CSRF token on `/api/*` routes, and the rate limiter is single-instance only (no Redis).
  - Explicitly deferred beyond Phase 8 (per `PILOT_READINESS.md`): rate limiting, CSRF hardening beyond `SameSite=Lax`, a real email provider, background worker deployment.
