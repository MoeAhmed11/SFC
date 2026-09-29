#!/usr/bin/env node
// Runs the test suite locally against SQLite, working around the fact that
// prisma/schema.prisma is pinned to `provider = "postgresql"` on main (see
// HOSTING.md "Single-trunk workflow") while there is no local Postgres
// server. This automates the documented manual workaround (temporarily flip
// the datasource provider to sqlite, regenerate, test, then restore) instead
// of requiring it to be done by hand before every local test run.
//
// Safety:
//  - The schema is restored from git (`git checkout -- prisma/schema.prisma`)
//    in a `finally` block, so it is restored even if tests fail, the Prisma
//    client fails to generate, or the script is interrupted (SIGINT/SIGTERM
//    handlers also trigger the same restore).
//  - The swapped schema is NEVER committed — this script only ever touches
//    the working tree, and always ends by regenerating the Postgres client
//    so `git status` is clean and node_modules/@prisma/client matches main
//    again once the script exits.
//  - Refuses to run if prisma/schema.prisma already has uncommitted changes,
//    so a real in-progress schema edit is never silently discarded.

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const schemaPath = join(projectRoot, "prisma", "schema.prisma");

const POSTGRES_LINE = 'provider = "postgresql"';
const SQLITE_LINE = 'provider = "sqlite"   // temporary, local only — revert before committing';

function run(command) {
  execSync(command, { cwd: projectRoot, stdio: "inherit" });
}

function hasUncommittedSchemaChanges() {
  const status = execSync("git status --porcelain -- prisma/schema.prisma", {
    cwd: projectRoot,
    encoding: "utf8",
  });
  return status.trim().length > 0;
}

function restoreSchema() {
  run("git checkout -- prisma/schema.prisma");
  console.log("[test-local] Restored prisma/schema.prisma (provider = postgresql).");
  console.log("[test-local] Regenerating Prisma client for the postgresql provider...");
  run("npx prisma generate");
}

let restored = false;
function restoreOnce(reason) {
  if (restored) return;
  restored = true;
  if (reason) console.log(`[test-local] ${reason}`);
  try {
    restoreSchema();
  } catch (err) {
    console.error(
      "[test-local] FAILED to restore prisma/schema.prisma automatically. " +
        'Run `git checkout -- prisma/schema.prisma && npx prisma generate` manually before continuing.',
    );
    console.error(err);
  }
}

// Restore on Ctrl+C / kill too, not just normal completion.
process.on("SIGINT", () => {
  restoreOnce("Interrupted (SIGINT) — restoring schema before exit.");
  process.exit(130);
});
process.on("SIGTERM", () => {
  restoreOnce("Interrupted (SIGTERM) — restoring schema before exit.");
  process.exit(143);
});

if (hasUncommittedSchemaChanges()) {
  console.error(
    "[test-local] prisma/schema.prisma already has uncommitted changes. " +
      "Commit, stash, or revert them first — this script will not overwrite an in-progress schema edit.",
  );
  process.exit(1);
}

const original = readFileSync(schemaPath, "utf8");
if (!original.includes(POSTGRES_LINE)) {
  console.error(
    `[test-local] Expected to find '${POSTGRES_LINE}' in prisma/schema.prisma — schema shape has changed, ` +
      "update this script's swap logic before relying on it.",
  );
  process.exit(1);
}

try {
  console.log("[test-local] Temporarily switching datasource provider to sqlite for local testing...");
  writeFileSync(schemaPath, original.replace(POSTGRES_LINE, SQLITE_LINE));

  console.log("[test-local] Regenerating Prisma client for the sqlite provider...");
  run("npx prisma generate");

  const extraArgs = process.argv.slice(2);
  const vitestCommand = ["npx vitest run", ...extraArgs.map((a) => `"${a}"`)].join(" ");
  console.log("[test-local] Running test suite...");
  run(vitestCommand);

  console.log("[test-local] Tests passed.");
} finally {
  restoreOnce("Restoring prisma/schema.prisma to provider = postgresql...");
}
