import type { Db } from "@/server/db";
import { NotFoundError, ValidationError } from "@/server/errors";
import { requireCapability, type StaffContext } from "@/server/tenancy/context";
import { findEventByIdInSchool } from "@/server/repositories/eventRepository";
import { getRecipientRows, type RecipientRow } from "@/server/repositories/dashboardRepository";

// Consent dashboard (FR-05). Totals are derived consistently from stored
// records so they always reconcile: consented + declined + outstanding = invited.

export interface ConsentTotals {
  invited: number;
  consented: number;
  declined: number;
  outstanding: number;
}

export const RESPONSE_FILTERS = ["all", "consented", "declined", "outstanding"] as const;
export type ResponseFilter = (typeof RESPONSE_FILTERS)[number];

export interface DashboardRow {
  pupilName: string;
  className: string | null;
  guardianName: string;
  status: "consented" | "declined" | "outstanding";
  respondedAt: Date | null;
}

function statusOf(row: RecipientRow): DashboardRow["status"] {
  if (row.response === "granted") return "consented";
  if (row.response === "declined") return "declined";
  return "outstanding";
}

export async function getEventDashboard(
  db: Db,
  ctx: StaffContext,
  eventId: string,
): Promise<{ totals: ConsentTotals; status: string }> {
  requireCapability(ctx, "event.view");
  const event = await findEventByIdInSchool(db, ctx.schoolId, eventId);
  if (!event) throw new NotFoundError("Event not found.");

  const rows = await getRecipientRows(db, ctx.schoolId, eventId);
  const totals: ConsentTotals = {
    invited: rows.length,
    consented: rows.filter((r) => r.response === "granted").length,
    declined: rows.filter((r) => r.response === "declined").length,
    outstanding: rows.filter((r) => r.response === null).length,
  };
  return { totals, status: event.status };
}

// Returns the response list, optionally filtered by status. Ordered by pupil.
export async function getEventResponses(
  db: Db,
  ctx: StaffContext,
  eventId: string,
  filter: ResponseFilter = "all",
): Promise<DashboardRow[]> {
  requireCapability(ctx, "event.view");
  if (!(RESPONSE_FILTERS as readonly string[]).includes(filter)) {
    throw new ValidationError("Invalid filter.");
  }
  const event = await findEventByIdInSchool(db, ctx.schoolId, eventId);
  if (!event) throw new NotFoundError("Event not found.");

  const rows = await getRecipientRows(db, ctx.schoolId, eventId);
  const mapped: DashboardRow[] = rows.map((r) => ({
    pupilName: `${r.pupilFirstName} ${r.pupilLastName}`,
    className: r.className,
    guardianName: r.guardianName,
    status: statusOf(r),
    respondedAt: r.respondedAt,
  }));

  if (filter === "all") return mapped;
  return mapped.filter((r) => r.status === filter);
}
