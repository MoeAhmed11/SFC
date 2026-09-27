import type { Db } from "@/server/db";
import { recordAudit } from "@/server/audit/audit";
import { NotFoundError } from "@/server/errors";
import { requireCapability, type StaffContext } from "@/server/tenancy/context";
import { toCsv } from "@/server/csv/serialize";
import { findEventByIdInSchool } from "@/server/repositories/eventRepository";
import { getRecipientRows } from "@/server/repositories/dashboardRepository";

// Consent register export (FR-09). Authorised staff only (event.view). The
// register includes response status and relevant timestamps. Export activity is
// audited — but the audit records counts only, never the exported personal data.

const REGISTER_HEADER = [
  "pupil_last_name",
  "pupil_first_name",
  "class_name",
  "guardian_name",
  "guardian_email",
  "status",
  "responded_at",
];

function statusLabel(response: string | null): string {
  if (response === "granted") return "consented";
  if (response === "declined") return "declined";
  return "outstanding";
}

export interface RegisterExport {
  filename: string;
  csv: string;
  rowCount: number;
}

export async function exportConsentRegister(
  db: Db,
  ctx: StaffContext,
  eventId: string,
): Promise<RegisterExport> {
  requireCapability(ctx, "event.view");
  const event = await findEventByIdInSchool(db, ctx.schoolId, eventId);
  if (!event) throw new NotFoundError("Event not found.");

  const rows = await getRecipientRows(db, ctx.schoolId, eventId);
  const csvRows = rows.map((r) => [
    r.pupilLastName,
    r.pupilFirstName,
    r.className ?? "",
    r.guardianName,
    r.guardianEmail,
    statusLabel(r.response),
    r.respondedAt ? r.respondedAt.toISOString() : "",
  ]);

  const csv = toCsv(REGISTER_HEADER, csvRows);

  await recordAudit(db, {
    schoolId: ctx.schoolId,
    actorType: "staff",
    actorId: ctx.staffUserId,
    action: "register.exported",
    entityType: "Event",
    entityId: eventId,
    metadata: { rowCount: rows.length },
  });

  // Filename uses the event id, not the title, to avoid leaking content and to
  // keep it filesystem-safe.
  return { filename: `consent-register-${eventId}.csv`, csv, rowCount: rows.length };
}
