import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Global setup: runs ONCE for the whole test run, before any test file and in
// its own process, so there are no open Prisma connections holding a Windows
// file lock on the SQLite database. It recreates a clean schema in test.db.
// Per-file data cleanup is handled by resetDb() in beforeEach.

export default function globalSetup() {
  const here = dirname(fileURLToPath(import.meta.url));
  const projectRoot = join(here, "..");
  const testDbPath = join(projectRoot, "prisma", "test.db");
  const databaseUrl = `file:${testDbPath.replace(/\\/g, "/")}`;

  for (const suffix of ["", "-journal"]) {
    const f = `${testDbPath}${suffix}`;
    if (existsSync(f)) {
      try {
        rmSync(f);
      } catch {
        // If the file is momentarily locked, db push with --accept-data-loss
        // will reconcile the schema anyway.
      }
    }
  }

  execSync("npx prisma db push --skip-generate --accept-data-loss", {
    cwd: projectRoot,
    stdio: "ignore",
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
}
