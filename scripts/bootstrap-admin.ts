// One-off bootstrap script: creates the FIRST real school + admin account.
//
// There is no self-service signup route (school creation is deliberately not
// exposed over HTTP), and activateWithPassword() has no capability check —
// it exists only for trusted, non-HTTP callers like this script and
// prisma/seed.ts (see staffAdminService.ts). This script fills the one gap
// neither covers: creating a REAL school's first admin with a password YOU
// choose, rather than seed.ts's fixed demo password.
//
// Usage (run once, against whichever database DATABASE_URL points at):
//   $env:DATABASE_URL = "<production connection string>"
//   npx tsx scripts/bootstrap-admin.ts \
//     --school "Real School Name" \
//     --schoolType state \
//     --admin-name "Jane Smith" \
//     --admin-email "jane.smith@realschool.example" \
//     --admin-password "a-strong-password-you-choose"
//
// Safe to re-run: if a school with the given name or a staff user with the
// given email already exists, it exits with an error instead of creating a
// duplicate or silently resetting a password.

import { prisma } from "../src/server/db";
import { createSchool } from "../src/server/repositories/schoolRepository";
import { inviteStaff, activateWithPassword } from "../src/server/services/staffAdminService";
import type { StaffContext } from "../src/server/tenancy/context";
import type { StaffRole } from "../src/server/domain";

interface Args {
  school: string;
  schoolType: "state" | "independent";
  adminName: string;
  adminEmail: string;
  adminPassword: string;
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | undefined => {
    const idx = argv.indexOf(flag);
    return idx === -1 ? undefined : argv[idx + 1];
  };

  const school = get("--school");
  const schoolType = get("--school-type") ?? "state";
  const adminName = get("--admin-name");
  const adminEmail = get("--admin-email");
  const adminPassword = get("--admin-password");

  if (!school || !adminName || !adminEmail || !adminPassword) {
    throw new Error(
      "Usage: tsx scripts/bootstrap-admin.ts --school <name> [--school-type state|independent] " +
        "--admin-name <name> --admin-email <email> --admin-password <password>",
    );
  }
  if (schoolType !== "state" && schoolType !== "independent") {
    throw new Error('--school-type must be "state" or "independent".');
  }

  return { school, schoolType, adminName, adminEmail, adminPassword };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const existingSchool = await prisma.school.findFirst({ where: { name: args.school } });
  if (existingSchool) {
    throw new Error(
      `A school named "${args.school}" already exists (id ${existingSchool.id}). ` +
        "Refusing to continue — use the staff UI to invite additional admins instead.",
    );
  }

  const school = await createSchool(prisma, {
    name: args.school,
    schoolType: args.schoolType,
    timezone: "Europe/London",
  });

  // Bootstrap-only actor context; there is no real staff user yet to attribute
  // this to, mirroring prisma/seed.ts's "seed" actor id.
  const bootstrapCtx: StaffContext = { schoolId: school.id, staffUserId: "bootstrap", role: "admin" };

  const role: StaffRole = "admin";
  const admin = await inviteStaff(prisma, bootstrapCtx, {
    name: args.adminName,
    email: args.adminEmail,
    role,
  });
  await activateWithPassword(prisma, school.id, admin.id, { password: args.adminPassword });

  console.log(`Created school "${school.name}" (${school.id}).`);
  console.log(`Created and activated admin "${admin.name}" <${admin.email}>.`);
  console.log("You can now log in with that email and the password you provided.");
}

main()
  .catch((err) => {
    console.error("[bootstrap-admin] failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
