import type { Db } from "@/server/db";
import type { EventStatus } from "@/server/domain";

// Tenant-scoped data access for events. Every method requires schoolId.

export interface CreateEventInput {
  schoolId: string;
  title: string;
  description?: string | null;
  location?: string | null;
  startsAt: Date;
  endsAt: Date;
  consentDeadline: Date;
  createdById: string;
}

export function findEventByIdInSchool(db: Db, schoolId: string, id: string) {
  return db.event.findFirst({ where: { id, schoolId } });
}

export function listEventsBySchool(db: Db, schoolId: string) {
  return db.event.findMany({ where: { schoolId }, orderBy: { startsAt: "asc" } });
}

// Number of events a staff user has created (Requirement 5 of the MVP admin &
// consent enhancements spec) — a hard-delete must be refused if this is > 0,
// since Event.createdById has no onDelete rule and deleting the row would
// either fail the FK constraint or silently lose "created by" attribution.
export function countEventsCreatedBy(db: Db, schoolId: string, staffUserId: string) {
  return db.event.count({ where: { schoolId, createdById: staffUserId } });
}

export function createEvent(db: Db, input: CreateEventInput) {
  return db.event.create({
    data: {
      schoolId: input.schoolId,
      title: input.title,
      description: input.description ?? null,
      location: input.location ?? null,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      consentDeadline: input.consentDeadline,
      createdById: input.createdById,
      status: "draft",
    },
  });
}

export interface UpdateEventFields {
  title?: string;
  description?: string | null;
  location?: string | null;
  startsAt?: Date;
  endsAt?: Date;
  consentDeadline?: Date;
  status?: EventStatus;
  publishedAt?: Date | null;
  cancelledAt?: Date | null;
}

// Scoped update via updateMany (id + schoolId) so a cross-tenant id cannot match.
export async function updateEventScoped(
  db: Db,
  schoolId: string,
  id: string,
  data: UpdateEventFields,
): Promise<number> {
  const result = await db.event.updateMany({ where: { id, schoolId }, data });
  return result.count;
}
