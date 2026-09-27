# Security & Privacy Risk Checklist

Status snapshot as of Phase 7. Grounded in the actual implementation — each
item names the code that provides it and, where relevant, the automated test
that verifies it. This is an internal engineering checklist, **not** a claim of
legal or regulatory compliance (spec Section 11 / 18.10). A UK data protection
and safeguarding review by a qualified party is required before any real
school or pupil data is processed.

## Tenant isolation

| Item | Status | Where |
| --- | --- | --- |
| Every data-access method requires and filters by `schoolId` | Done | `src/server/repositories/*` — see `README.md` code-layer notes |
| `schoolId` is always derived from a verified session or token, never from client-supplied IDs | Done | `authService.resolveSession`, `secureLinkService.validateToken` |
| Cross-tenant reads/writes return a generic not-found/forbidden, not a distinguishing error | Done | `tests/tenant-isolation.test.ts`, `tests/data-management.test.ts`, `tests/events.test.ts` |

## Authentication & sessions

| Item | Status | Where |
| --- | --- | --- |
| Passwords hashed with a memory-hard KDF (scrypt), never stored in plaintext | Done | `src/server/auth/password.ts` |
| Session tokens are high-entropy (256-bit), hashed at rest, raw value never persisted | Done | `src/server/auth/tokens.ts` |
| Sessions enforce expiry, revocation, and active-staff status on every use | Done | `authService.resolveSession`; `tests/auth-session.test.ts` |
| Login failures are generic (no account-existence signal) | Done | `authService.login` |
| Login is rate-limited against brute-force/credential-stuffing | Done | `/api/auth/login` — 10 attempts / 5 min per IP via `checkRateLimit`. |

## Rate limiting

`src/server/http/rateLimit.ts` is a fixed-window counter, keyed by an
arbitrary string. Applied so far:

| Route | Limits | Why |
| --- | --- | --- |
| `POST /api/auth/login` | 10 / 5 min per IP | Brute-force / credential stuffing. |
| `GET/POST /api/consent/[token]` | 30 / 5 min per IP **and** 20 / 5 min per token | Per-IP blunts a source scanning many tokens; per-token stops one leaked/guessed token being hammered regardless of source IP (FR-04). |
| `GET/POST /api/accept-invite/[token]` | Same shape as consent tokens | Same reasoning — this is the same class of token-guessing risk. |
| `POST /api/staff` (invite) | 20 / 5 min per IP | Throttles bulk-invite abuse from a compromised/scripted session, distinct from token-guessing. |

**Known limitation, stated plainly:** the limiter is an in-process `Map` — it
is **not shared across server instances**. In a single-instance deployment
(the only kind currently documented, see `PILOT_READINESS.md`) this is
effective. In a horizontally-scaled deployment, an attacker distributed across
multiple app instances could exceed the intended aggregate limit, because each
instance enforces its own counter. The `RateLimiter` interface is
storage-agnostic specifically so a Redis-backed implementation can replace
`InMemoryRateLimiter` later (mirroring the same single-instance caveat already
accepted for the notification queue) without changing any call site — but that
swap has not been made, because there is no Redis in this environment.

Not yet rate-limited: CSV import commit, event mutation routes, and most other
authenticated staff routes. These require a valid session, so the threat model
is different (an authenticated abuser, not an anonymous attacker) and was
judged lower priority than the anonymous-facing routes above; revisit if abuse
from compromised staff sessions becomes a concern.

## CSRF

Reviewed posture, not a new mechanism added this pass:

- **Server Actions** (staff login form, event forms, consent form, accept-invite
  form, staff invite/role/deactivate actions) get Next.js's **built-in** CSRF
  protection: the framework verifies the request's `Origin` header against the
  deployed host on every Server Action invocation, rejecting mismatches before
  the action runs. This is on by default and was not disabled anywhere in this
  codebase.
- **`/api/*` JSON route handlers** rely on two layers: the session cookie's
  `SameSite=Lax` (not sent on cross-site subrequests/form submissions), plus
  the fact that a plain cross-site HTML `<form>` cannot produce an
  `application/json` request body — only `application/x-www-form-urlencoded`,
  `multipart/form-data`, or `text/plain` — so a naive cross-site form-based
  CSRF attempt against these routes fails on content-type alone before it
  reaches any handler logic.
- **Every mutating route is `POST` or `PATCH`, never `GET`** (verified by
  inspection of `src/app/api/**/route.ts`), so `SameSite=Lax`'s known gap —
  it still permits cross-site top-level `GET` navigations — cannot be used to
  trigger a state change here.
- **Residual gap, stated plainly:** `/api/*` routes have no explicit
  synchronizer-token CSRF check. The risk is narrowed by the content-type
  barrier above, but not eliminated (e.g. an unusual proxy/CORS
  misconfiguration could in principle widen what a cross-site caller can send).
  Adding an explicit CSRF token to the JSON routes is a reasonable
  defense-in-depth addition for a future pass; it was not built in this one
  because doing it well (token generation, injection into every calling
  client, verification middleware) is its own scoped piece of work, not a
  documentation-only review.

## Secure parent links (FR-04)

| Item | Status | Where |
| --- | --- | --- |
| High-entropy (256-bit), recipient-specific tokens | Done | `secureLinkService.issueTokenForRecipient`; `tests/secure-links.test.ts` |
| Only the token hash is stored; raw token exists only transiently (issuance/delivery) | Done | `SecureAccessToken.tokenHash`; tokens for reminders are issued fresh at send time (`notificationService.ts`), not stored ahead of time |
| No pupil name, contact details, or other PII in the URL | Done | Links are `{base}/{opaque-token}`; pupil/guardian identity is resolved server-side only |
| Expiry, revocation, and generic invalid-link handling (no information leak) | Done | `secureLinkService.validateToken` returns `null` for every failure mode; `consentService` surfaces one generic message |
| A consent form is never exposed without server-side token validation | Done | `consentService.getConsentView` / `submitConsent` always call `validateToken` first |
| Reissue is possible and revokes the prior token | Done | `secureLinkService.reissueLink`; `tests/secure-links.test.ts` |
| Cancelling an event revokes its outstanding tokens | Done | `eventService.cancelEvent` → `revokeTokensForEvent` |
| Rate limiting on token-consuming endpoints | Done | `src/server/http/rateLimitGuard.ts` — per-IP and per-token fixed-window limits on `/api/consent/[token]` and `/api/accept-invite/[token]`; see "Rate limiting" below for the caveat. |
| Additional identity verification for higher-risk actions | **Not done / open** | Not required for the simple yes/no MVP scope; revisit if consent scope expands (spec 17.12). |

## Authorisation (RBAC)

| Item | Status | Where |
| --- | --- | --- |
| Server-side, capability-based checks on every mutation (never client-trusted) | Done | `src/server/tenancy/context.ts` (`requireCapability`), used in every service |
| Explicit, testable role→capability matrix | Done | `domain.ts` `ROLE_CAPABILITIES`; `tests/rbac.test.ts` |
| Least privilege for policy-changing settings (consent editing/late/offline) | Done | `school.manage_settings` is admin-only (Phase 7) |

## Data minimisation

| Item | Status | Where |
| --- | --- | --- |
| Pupil/guardian records hold only minimal identifying fields | Done | `Pupil`/`Guardian` models — name, email/class only |
| No child PII in notification subjects/bodies | Done | `notifications/templates.ts` refers to "your child", never the pupil's name; `tests/notifications.test.ts` asserts this |
| No raw CSV content or personal values in logs/audit | Done | `csv/import.ts` audits counts only; error messages name the field, not the value |
| Audit metadata is sanitised against known-sensitive keys as a backstop | Done | `audit/audit.ts` `FORBIDDEN_METADATA_KEYS` |
| Audit trail covers required administrative/consent/notification/export actions | Done (reviewed Phase 7) | See the full action list in `README.md` → "Audit actions currently recorded" |

## Secrets & configuration

| Item | Status | Where |
| --- | --- | --- |
| No secrets committed to source control | Done | `.env` is gitignored; `.env.example` has placeholders only |
| Session secret / DB URL sourced from environment | Done | `.env.example` |
| Dependencies pinned to exact versions | Done | `package.json` |

## Reliability

| Item | Status | Where |
| --- | --- | --- |
| Notification sends are idempotent (no duplicate sends on retry) | Done | Unique `dedupeKey` + status guard; `tests/notifications.test.ts` |
| Failed jobs are retryable and visible to administrators | Done | `notificationService.markFailed`; `monitoringService.listFailedNotificationsForSchool` (Phase 7) |
| Bounded retry / exhaustion visibility | Done | `MAX_NOTIFICATION_ATTEMPTS`, `hasExhaustedRetries` |

## Known gaps to close before a real pilot

1. **Rate limiting is single-instance only** — see "Rate limiting" above. Fine
   for the currently-documented single-instance deployment; needs a
   Redis-backed `RateLimiter` before horizontal scaling.
2. **No explicit CSRF token on `/api/*` routes** — see "CSRF" above. Narrowed
   by content-type + `SameSite=Lax` + POST/PATCH-only mutations, not
   eliminated by a dedicated token check.
3. **No production security headers beyond `Referrer-Policy`** (set in
   `next.config.mjs`) — no CSP, no `X-Content-Type-Options`, no HSTS
   configuration yet.
4. **No encryption-at-rest configuration** — SQLite (dev/test) and a future
   PostgreSQL deployment both need disk/volume encryption configured at the
   infrastructure level; this is outside application code.
5. **No automated dependency/vulnerability scanning in CI** — there is no CI
   pipeline yet; `npm audit` is run manually (see README "Known issues").
6. **No formal penetration test or accessibility audit** — required before a
   pilot handling real children's data (see `ACCESSIBILITY_CHECKLIST.md` and
   Section 18.10).
