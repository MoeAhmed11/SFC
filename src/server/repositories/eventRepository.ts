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
