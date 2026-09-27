import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Per-file setup: only sets environment variables. It must NOT touch the
// database file — schema preparation happens once in tests/globalSetup.ts so
// there is no race with open connections/file locks on Windows. Data is reset
// per test via resetDb() in beforeEach.

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(here, "..");
const testDbPath = join(projectRoot, "prisma", "test.db");

// Must be set before any import of the Prisma client / db.ts.
process.env.DATABASE_URL = `file:${testDbPath.replace(/\\/g, "/")}`;
process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-000000000000000000000000000000";
process.env.SESSION_TTL_SECONDS = process.env.SESSION_TTL_SECONDS ?? "28800";
process.env.NODE_ENV = "test";
