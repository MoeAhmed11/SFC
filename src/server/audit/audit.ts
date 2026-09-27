import type { Db } from "@/server/db";
import type { ActorType } from "@/server/domain";

// Append-only audit writer (Section 7 FR-01, Section 11). Records important
// actions with minimal metadata. Callers must NOT pass secrets, passwords, raw
// tokens, or unnecessary personal data in `metadata`.

export interface AuditInput {
  schoolId: string;
  actorType: ActorType;
  actorId?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}

// Keys that must never be persisted to the audit log even if a caller mistakenly
// includes them. Defence-in-depth against accidental sensitive-data logging.
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

// Writes an audit entry. Accepts a Db/transaction client so it can participate
// in the same transaction as the action it records.
export async function recordAudit(db: Db, input: AuditInput): Promise<void> {
  await db.auditLog.create({
    data: {
      schoolId: input.schoolId,
      actorType: input.actorType,
      actorId: input.actorId ?? null,
      action: input.action,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      metadata: sanitiseMetadata(input.metadata),
    },
  });
}
