# Hosting ConsaPass on Render

This documents how to deploy ConsaPass to [Render](https://render.com)
using the `render.yaml` Blueprint in the repo root. Read this alongside
`PILOT_READINESS.md` — deploying does not resolve every gap listed there
(no CI, no UK data protection review, etc.). It gives the app a place to
run and closes the "no production datastore," "no background worker
deployment," and (now that Resend is configured) "no real email provider"
gaps specifically.

## What the Blueprint provisions

`render.yaml` defines three resources, all in the `frankfurt` region (EU) —
see [Data residency](#data-residency-why-frankfurt) below:

1. **`consapass-db`** — managed Render Postgres.
2. **`consapass-web`** — the Next.js app: builds, runs pending Prisma
   migrations (`preDeployCommand`), then starts (`npm start`).
3. **`consapass-worker`** — a Render **Cron Job** running every 15
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

## Single-trunk workflow: `main` is the production branch

This project uses **one branch, `main`**, and Render deploys from it directly.
`main` carries the **PostgreSQL** Prisma schema and the production
`render.yaml`. There is no separate `deploy/render` branch any more.

The tradeoff: because `prisma/schema.prisma` is pinned to `postgresql` and no
Postgres server runs locally, the SQLite-based local `npm run dev` / `npm test`
path does **not** work against `main` unmodified — `tests/globalSetup.ts` does
`prisma db push` against a `file:` SQLite URL, which the Postgres provider
rejects. This is a deliberate, accepted state: **verification currently happens
against the live Render/Postgres deployment**, not locally or in CI. A proper
dev environment (a local Postgres, or a scripted provider swap to SQLite) should
be stood up before any real school data is onboarded.

If you need to run the test suite locally in the meantime, temporarily flip the
provider to SQLite (the schema is kept Postgres/SQLite-compatible), then revert
it — do not commit the swap:

```prisma
datasource db {
  provider = "sqlite"   // temporary, local only — revert before committing
  url      = env("DATABASE_URL")
}
```

```powershell
npx prisma generate; npm test   # then: git checkout -- prisma/schema.prisma
```

Migrations for Postgres live in `prisma/migrations/`. Render's
`preDeployCommand` (`npx prisma migrate deploy`) applies them to the real
database on every deploy — it never uses `migrate dev`, so it's safe to run
unattended.

## Known pitfall: don't set `NODE_ENV=production` as a persistent env var

`render.yaml` deliberately does **not** set `NODE_ENV` in the web service's
or cron job's `envVars` list. If you set `NODE_ENV: production` there,
Render injects it into the **build** environment too (`npm ci`, `npm run
build`, `npx prisma migrate deploy`), and npm's rule is: if `NODE_ENV=production`
is set when it installs, it skips `devDependencies` entirely — including
`typescript`, `@types/node`, `@types/react`, `prisma`, and `tsx`, all of
which the build and pre-deploy steps need. This produces the error:

```
It looks like you're trying to use TypeScript but do not have the required
package(s) installed. Please install typescript, @types/react, and
@types/node...
```

even though those packages are correctly listed in `package.json`.

`NODE_ENV=production` still matters at **runtime** — `src/server/db.ts` uses
it to gate Prisma's logging, and `src/server/http/session.ts` uses it to
require the `secure` cookie flag — so it's set inline on `startCommand`
instead (`NODE_ENV=production npm start` / `NODE_ENV=production npm run
worker -- all`), which only applies to the running process, never to the
build or pre-deploy steps. Don't move it back into `envVars`.

## Deploy steps

1. Push the repo (with the Postgres provider switch above) to a Git host
   Render can access (GitHub/GitLab).
2. In the Render Dashboard: **New > Blueprint**, select the repo and the
   **`main`** branch. `main` carries the `postgresql` datasource and
   `render.yaml`'s resources all pin `branch: main` to match. Render reads
   `render.yaml` and shows the resources to create. (If you have an existing
   Blueprint still pointing at the old `deploy/render` branch, repoint it to
   `main` in each service's **Settings > Build & Deploy > Branch**.)
3. Render will prompt for the one `sync: false` secret this Blueprint
   defines: **`RESEND_API_KEY`** (on both the web service and the worker
   cron job). Paste the real key from the Resend dashboard when prompted —
   never into `render.yaml` itself. `SESSION_SECRET` is auto-generated
   (`generateValue: true`) and `DATABASE_URL` is wired automatically from the
   Postgres instance (`fromDatabase`), so neither needs manual entry.
4. Before or shortly after applying, verify `consapass.co.uk` as a sending
   domain in the Resend dashboard (adds SPF/DKIM DNS records) — `EMAIL_FROM`
   is already set to `no-reply@consapass.co.uk` in `render.yaml`, so sends
   will fail until that domain is verified.
5. Click **Apply**. Render provisions Postgres first, then builds and
   deploys the web service and the cron job.
6. Point the `consapass.co.uk` custom domain at the deployed web service
   (Render Dashboard → the `consapass-web` service → **Settings > Custom
   Domains**), and add the CNAME/A record Render gives you at your domain
   registrar. `render.yaml` already assumes `https://consapass.co.uk` for
   `APP_BASE_URL`/`PARENT_LINK_BASE_URL` — these build staff invite links and
   parent consent links, so the custom domain must be live and resolving
   before inviting real staff.
7. Seed or create the first school. `prisma/seed.ts` creates synthetic demo
   data only — for a real school, use the staff signup/invite path once one
   admin account exists, or run a one-off script via Render's Shell tab.

## Shipping updates: how a push redeploys the same services

Once the Blueprint exists, Render redeploys the **same** services on every
commit to `main` (`autoDeployTrigger: commit` in `render.yaml`). It matches
services by name (the web service + worker cron job), so a push updates them
**in place** — nothing is duplicated or torn down, and the Postgres instance is
never recreated. Each deploy just rebuilds the app code and runs
`npx prisma migrate deploy` (migrations, not a wipe).

**Net effect:** `git push origin main` → Render rebuilds and redeploys the
existing web + worker services. Same services, same database, updated code.

There is no promotion/rebase step any more — the old
`.github/workflows/promote-to-render.yml` (which bridged a separate
`deploy/render` branch) has been removed now that `main` is the single trunk.
`.github/workflows/deploy.yml` remains as an optional manual trigger for
re-deploying without a new commit (e.g. after rotating a secret), and requires
the `RENDER_DEPLOY_HOOK_URL` secret to do anything.

## What this does and doesn't fix

**Fixed by this Blueprint:**
- Production datastore (managed Postgres, replacing SQLite).
- Scheduled execution of `processDueNotifications` and
  `runRetentionSweep` (previously callable functions with no caller).
- Real email delivery via Resend (`EMAIL_PROVIDER=resend`), once
  `consapass.co.uk` is verified in Resend and `RESEND_API_KEY` is set —
  invite and reminder emails are actually sent instead of copy-pasted links.

**Still open — unchanged by hosting choice, see PILOT_READINESS.md:**
- Rate limiting is in-process (`InMemoryRateLimiter`). Render web services
  and cron jobs are separate processes, and if the web service is ever
  scaled to more than one instance, per-instance limits stop being a
  meaningful global limit. Fine for a single-instance pilot; revisit before
  scaling web instances beyond 1.
- No CI pipeline — tests/typecheck/build are still run manually before
  deploying.
- No UK data protection/safeguarding review has been performed. Do not point
  this deployment at real pupil/guardian data before that review happens,
  regardless of where it's hosted.

## Data residency: why Frankfurt

ConsaPass handles UK pupil and guardian personal data under UK GDPR.
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
  available in this environment) — verify steps 1–7 above against a real
  Render account before treating this as pilot-ready. The Resend send path
  itself was verified separately with unit tests against a stubbed `fetch`
  (`tests/resend-email-provider.test.ts`) — no real email has been sent to a
  real recipient yet; do that once the domain is verified and the key is set.
