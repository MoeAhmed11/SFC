import type { Db } from "@/server/db";

// Append-only writer for PlatformAuditLog. Kept separate from
// src/server/audit/audit.ts (which is always schoolId-scoped) since platform
// actions have no single school to attribute to.

export interface PlatformAuditInput {
  platformUserId: string;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}

// Keys that must never be persisted, mirroring audit.ts's defence-in-depth
// list for the tenant-scoped audit log.
const FORBIDDEN_METADATA_KEYS = new Set([
  "password",
  "passwordhash",
  "password_hash",
  "token",
  "tokenhash",
  "token_hash",
  "rawtoken",
  "secret",
]);

function sanitiseMetadata(metadata: Record<string, unknown> | undefined): string {
  if (!metadata) return "{}";
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (FORBIDDEN_METADATA_KEYS.has(key.toLowerCase())) continue;
    clean[key] = value;
  }
  return JSON.stringify(clean);
}

export async function recordPlatformAudit(db: Db, input: PlatformAuditInput): Promise<void> {
  await db.platformAuditLog.create({
    data: {
      platformUserId: input.platformUserId,
      action: input.action,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      metadata: sanitiseMetadata(input.metadata),
    },
  });
}
