# Hosting SchoolConnect on Render

This documents how to deploy SchoolConnect to [Render](https://render.com)
using the `render.yaml` Blueprint in the repo root. Read this alongside
`PILOT_READINESS.md` — deploying does not resolve the gaps listed there
(no real email provider, no CI, no UK data protection review, etc.). It only
gives the app a place to run and closes the "no production datastore" and
"no background worker deployment" gaps specifically.

## What the Blueprint provisions

`render.yaml` defines three resources, all in the `frankfurt` region (EU) —
see [Data residency](#data-residency-why-frankfurt) below:

1. **`schoolconnect-db`** — managed Render Postgres.
2. **`schoolconnect-web`** — the Next.js app: builds, runs pending Prisma
   migrations (`preDeployCommand`), then starts (`npm start`).
3. **`schoolconnect-worker`** — a Render **Cron Job** running every 15
   minutes. It runs `npm run worker -- all`, which calls
   `processDueNotifications` and `retentionService.runRetentionSweep` for
   every school (`scripts/worker.ts`). This is the scheduled process that
   PILOT_READINESS.md says doesn't exist yet — Render's free/starter plans
   have no persistent background-worker primitive, so a cron job that runs
   the drain function periodically is the equivalent for this app's job
   volume. If notification volume ever needs sub-15-minute latency, lower
   the `schedule` cron expression (Render times are UTC) or split
   notifications and retention into two separate cron jobs with different
   schedules (`npm run worker -- notifications` / `-- retention`).

## One manual step before your first deploy: switch the Prisma provider

`prisma/schema.prisma` targets SQLite locally on purpose (no DB server is
available in dev). Prisma's `datasource` provider can't be set from an
environment variable, so switching to Postgres for a real deploy is a
one-line code change, not a config change:

```prisma
datasource db {
  provider = "postgresql"   // was "sqlite"
  url      = env("DATABASE_URL")
}
```

Do this on a deploy branch (e.g. `deploy/render`) rather than in the schema
everyone uses for local dev, or local `npm run dev` / `npm test` will break
for anyone still on SQLite. Because the schema was deliberately kept
Postgres-compatible (no SQLite-only types), no model changes are needed —
only this one line, plus regenerating migrations for Postgres:

```powershell
# On the deploy branch, after changing the provider line above:
Remove-Item -Recurse -Force prisma/migrations
$env:DATABASE_URL = "postgresql://user:password@localhost:5432/schoolconnect_shadow"
npx prisma migrate dev --name init_postgres
```

Commit the regenerated `prisma/migrations/` folder on that branch. Render's
`preDeployCommand` (`npx prisma migrate deploy`) then applies them to the
real database on every deploy — it never uses `migrate dev`, so it's safe to
run unattended.

## Deploy steps

1. Push the repo (with the Postgres provider switch above) to a Git host
   Render can access (GitHub/GitLab).
2. In the Render Dashboard: **New > Blueprint**, select the repo/branch.
   Render reads `render.yaml` and shows the three resources to create.
3. Render will prompt for any `sync: false` secrets. This Blueprint doesn't
   define any yet — `SESSION_SECRET` is auto-generated
   (`generateValue: true`) and `DATABASE_URL` is wired automatically from the
   Postgres instance (`fromDatabase`). If you add a real email provider
   later (see below), its API key should be added as a `sync: false` env var
   so it's never committed.
4. Click **Apply**. Render provisions Postgres first, then builds and
   deploys the web service and the cron job.
5. Once the web service is live, update `APP_BASE_URL` and
   `PARENT_LINK_BASE_URL` in `render.yaml` (and the cron job's copy) to match
   the actual `onrender.com` hostname Render assigned, or your custom domain
   — then commit and let Render redeploy. These are used to build staff
   invite links and parent consent links, so they must be correct before
   inviting real staff.
6. Seed or create the first school. `prisma/seed.ts` creates synthetic demo
   data only — for a real school, use the staff signup/invite path once one
   admin account exists, or run a one-off script via Render's Shell tab.

## What this does and doesn't fix

**Fixed by this Blueprint:**
- Production datastore (managed Postgres, replacing SQLite).
- Scheduled execution of `processDueNotifications` and
  `runRetentionSweep` (previously callable functions with no caller).

**Still open — unchanged by hosting choice, see PILOT_READINESS.md:**
- No real email provider (`EMAIL_PROVIDER=mock` is set in `render.yaml`;
  invite/consent links must still be copied and sent manually until a real
  provider is implemented behind `EmailProvider`).
- Rate limiting is in-process (`InMemoryRateLimiter`). Render web services
  and cron jobs are separate processes, and if the web service is ever
  scaled to more than one instance, per-instance limits stop being a
  meaningful global limit. Fine for a single-instance pilot; revisit before
  scaling web instances beyond 1.
- No CI pipeline — tests/typecheck/build are still run manually before
  deploying.
- Brand name collision risk (see PILOT_READINESS.md) is unrelated to
  hosting and still unresolved.
- No UK data protection/safeguarding review has been performed. Do not point
  this deployment at real pupil/guardian data before that review happens,
  regardless of where it's hosted.

## Data residency: why Frankfurt

SchoolConnect handles UK pupil and guardian personal data under UK GDPR.
Render's regions include `frankfurt` (EU) but no UK-specific region at time
of writing; Frankfurt keeps data inside the EU rather than defaulting to
Render's US regions (`oregon`, `ohio`, `virginia`). This is a reasonable
default, not a substitute for the data protection review noted above — that
review may have its own requirements for where data is stored.

## Local verification performed

- `npm run worker -- all` was run locally against the seeded SQLite dev
  database and exercised both code paths cleanly (notifications: nothing
  due; retention: iterated both demo schools, nothing expired) — confirming
  the script's logic and imports work before relying on Render to run it.
- The Postgres migration regeneration and the actual Render deploy were
  **not** run as part of this change (no Postgres instance or Render account
  available in this environment) — verify steps 1–6 above against a real
  Render account before treating this as pilot-ready.
