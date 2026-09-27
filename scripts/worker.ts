// Scheduled worker entry point — run as a Render Cron Job (see render.yaml /
// HOSTING.md), not as a long-lived process. Runs the two maintenance jobs
// that PILOT_READINESS.md flags as "callable function, not a running
// service": notification delivery and the data retention sweep.
//
// Usage: tsx scripts/worker.ts [notifications|retention|all]
// Defaults to "all" when no argument is given (suitable for a single cron
// schedule that runs everything). Split into separate Render Cron Jobs with
// different schedules if notifications need to run more often than
// retention — see HOSTING.md.
//
// This script intentionally bypasses the normal HTTP/StaffContext boundary:
// it is trusted infrastructure code, not a request handler, so it is allowed
// to iterate all schools directly. It builds a synthetic admin StaffContext
// per school purely to satisfy runRetentionSweep's capability check and to
// attribute audit entries to an identifiable system actor, never a real
// staff member.

// Relative imports, not the "@/" alias, deliberately — plain tsx (unlike
// Next's bundler) does not resolve tsconfig.json path aliases at runtime.
// prisma/seed.ts follows the same convention for the same reason.
import { prisma } from "../src/server/db";
import { processDueNotifications } from "../src/server/services/notificationService";
import { runRetentionSweep } from "../src/server/services/retentionService";
import { createEmailProvider } from "../src/server/notifications/EmailProviderConfig";
import type { StaffContext } from "../src/server/tenancy/context";

const SYSTEM_ACTOR_ID = "system-worker";

function systemContextFor(schoolId: string): StaffContext {
  return { schoolId, staffUserId: SYSTEM_ACTOR_ID, role: "admin" };
}

async function runNotifications(): Promise<void> {
  const provider = createEmailProvider();
  const result = await processDueNotifications(prisma, provider);
  console.log(
    `[worker] notifications: processed=${result.processed} sent=${result.sent} ` +
      `skipped=${result.skipped} failed=${result.failed}`,
  );
}

async function runRetention(): Promise<void> {
  const schools = await prisma.school.findMany({ select: { id: true, name: true } });
  for (const school of schools) {
    const ctx = systemContextFor(school.id);
    const counts = await runRetentionSweep(prisma, ctx);
    console.log(
      `[worker] retention: school=${school.name} (${school.id}) ` +
        `consentResponses=${counts.supersededConsentResponses} ` +
        `notifications=${counts.notifications} auditLogs=${counts.auditLogs}`,
    );
  }
}

async function main(): Promise<void> {
  const mode = (process.argv[2] ?? "all").toLowerCase();

  if (mode === "notifications" || mode === "all") {
    await runNotifications();
  }
  if (mode === "retention" || mode === "all") {
    await runRetention();
  }
  if (mode !== "all" && mode !== "notifications" && mode !== "retention") {
    throw new Error(`Unknown worker mode "${mode}". Expected: notifications, retention, all.`);
  }
}

main()
  .catch((err) => {
    console.error("[worker] failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
