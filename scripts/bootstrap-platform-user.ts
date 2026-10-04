// One-off bootstrap script: creates the FIRST platform (super-user) account.
//
// There is no self-service signup for the platform layer either (mirroring
// scripts/bootstrap-admin.ts's reasoning for schools) — a platform account
// can create schools and admins and view usage data across every school on
// the platform, so it must never be reachable without already having
// shell/deploy access to the database.
//
// Usage (run once, against whichever database DATABASE_URL points at):
//   $env:DATABASE_URL = "<production connection string>"
//   npx tsx scripts/bootstrap-platform-user.ts \
//     --name "Jane Smith" \
//     --email "jane.smith@consapass.co.uk" \
//     --password "a-strong-password-you-choose"
//
// Safe to re-run: if a platform user with the given email already exists, it
// exits with an error instead of creating a duplicate or silently resetting
// a password.

import { prisma } from "../src/server/db";
import { hashPassword } from "../src/server/auth/password";
import { createPlatformUser, findPlatformUserByEmail } from "../src/server/repositories/platformUserRepository";
import { createPlatformUserSchema } from "../src/server/validation";

interface Args {
  name: string;
  email: string;
  password: string;
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | undefined => {
    const idx = argv.indexOf(flag);
    return idx === -1 ? undefined : argv[idx + 1];
  };

  const name = get("--name");
  const email = get("--email");
  const password = get("--password");

  if (!name || !email || !password) {
    throw new Error(
      "Usage: tsx scripts/bootstrap-platform-user.ts --name <name> --email <email> --password <password>",
    );
  }

  return { name, email, password };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const parsed = createPlatformUserSchema.safeParse(args);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid platform user details.");
  }

  const existing = await findPlatformUserByEmail(prisma, parsed.data.email);
  if (existing) {
    throw new Error(
      `A platform user with email "${parsed.data.email}" already exists (id ${existing.id}). ` +
        "Refusing to continue.",
    );
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const user = await createPlatformUser(prisma, {
    name: parsed.data.name,
    email: parsed.data.email,
    passwordHash,
  });

  console.log(`Created platform user "${user.name}" <${user.email}> (${user.id}).`);
  console.log("You can now sign in at /platform/login with that email and the password you provided.");
}

main()
  .catch((err) => {
    console.error("[bootstrap-platform-user] failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
