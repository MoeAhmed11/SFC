import type { Db } from "@/server/db";

// Data access for PlatformUser. Unlike every other repository in this
// codebase, these methods are NOT schoolId-scoped — a platform user belongs
// to no tenant (see prisma/schema.prisma's PlatformUser comment). Email is
// unique globally here (not per-school), since there is no tenant to
// disambiguate within.

export interface CreatePlatformUserInput {
  name: string;
  email: string;
  passwordHash: string;
}

export function findPlatformUserByEmail(db: Db, email: string) {
  return db.platformUser.findUnique({ where: { email } });
}

export function findPlatformUserById(db: Db, id: string) {
  return db.platformUser.findUnique({ where: { id } });
}

export function createPlatformUser(db: Db, input: CreatePlatformUserInput) {
  return db.platformUser.create({
    data: {
      name: input.name,
      email: input.email,
      passwordHash: input.passwordHash,
      status: "active",
    },
  });
}
