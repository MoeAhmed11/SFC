import type { Db } from "@/server/db";
import { prisma } from "@/server/db";
import { recordAudit } from "@/server/audit/audit";
import { canTransitionEvent, isEventStatus, type EventStatus } from "@/server/domain";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { requireCapability, type StaffContext } from "@/server/tenancy/context";
import { createEventSchema, editEventSchema } from "@/server/validation";
import {
  createEvent,
  findEventByIdInSchool,
  listEventsBySchool,
  updateEventScoped,
} from "@/server/repositories/eventRepository";
import { findClassByIdInSchool } from "@/server/repositories/classRepository";
import {
  createRecipients,
  findPrimaryContactPairs,
} from "@/server/repositories/eventRecipientRepository";
import { revokeTokensForEvent } from "@/server/repositories/tokenRepository";
import {
  scheduleEventNotifications,
  suppressPendingForEvent,
} from "@/server/services/reminderScheduler";

// Event management (FR-02). Mutations require the "event.manage" capability
// (admins and organisers), are tenant-scoped, and are audited. Status changes
// go through the transition guard in domain.ts.

export interface CreateEventInput {
  title: string;
  description?: string;
  location?: string;
  startsAt: Date | string;
  endsAt: Date | string;
  consentDeadline: Date | string;
  classGroupId?: string;
}

export async function createEventDraft(db: Db, ctx: StaffContext, input: CreateEventInput) {
  requireCapability(ctx, "event.manage");
  const parsed = createEventSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(firstIssue(parsed.error));
  }

  if (parsed.data.classGroupId) {
    const cls = await findClassByIdInSchool(db, ctx.schoolId, parsed.data.classGroupId);
    if (!cls) throw new NotFoundError("Class not found in this school.");
  }

  const event = await createEvent(db, {
    schoolId: ctx.schoolId,
    title: parsed.data.title,
    description: parsed.data.description ?? null,
    location: parsed.data.location ?? null,
    startsAt: parsed.data.startsAt,
    endsAt: parsed.data.endsAt,
    consentDeadline: parsed.data.consentDeadline,
    createdById: ctx.staffUserId,
  });

  // Note: the target class is validated here but recipient generation happens
  // at publish time, where the class scope is supplied to publishEvent. This
  // keeps the draft's recipient set from going stale as rosters change.

  await recordAudit(db, {
    schoolId: ctx.schoolId,
    actorType: "staff",
    actorId: ctx.staffUserId,
    action: "event.created",
    entityType: "Event",
    entityId: event.id,
  });
  return event;
}

export async function listEvents(db: Db, ctx: StaffContext) {
  requireCapability(ctx, "event.view");
  return listEventsBySchool(db, ctx.schoolId);
}

export async function getEvent(db: Db, ctx: StaffContext, eventId: string) {
  requireCapability(ctx, "event.view");
  const event = await findEventByIdInSchool(db, ctx.schoolId, eventId);
  if (!event) throw new NotFoundError("Event not found.");
  return event;
}

// Edits are only allowed while an event is still a draft in this phase; editing
// a published event (with recipient re-computation and change notices) is
// handled in the notifications phase (Journey F).
export async function editEvent(
  db: Db,
  ctx: StaffContext,
  eventId: string,
  input: Record<string, unknown>,
) {
  requireCapability(ctx, "event.manage");
  const event = await requireEvent(db, ctx, eventId);
  if (event.status !== "draft") {
    throw new ConflictError("Only draft events can be edited in this version.");
  }

  const parsed = editEventSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(firstIssue(parsed.error));

  if (parsed.data.classGroupId) {
    const cls = await findClassByIdInSchool(db, ctx.schoolId, parsed.data.classGroupId);
    if (!cls) throw new NotFoundError("Class not found in this school.");
  }

  const count = await updateEventScoped(db, ctx.schoolId, eventId, {
    title: parsed.data.title,
    description: parsed.data.description,
    location: parsed.data.location,
    startsAt: parsed.data.startsAt,
    endsAt: parsed.data.endsAt,
    consentDeadline: parsed.data.consentDeadline,
  });
  if (count === 0) throw new NotFoundError("Event not found.");

  await recordAudit(db, {
    schoolId: ctx.schoolId,
    actorType: "staff",
    actorId: ctx.staffUserId,
    action: "event.updated",
    entityType: "Event",
    entityId: eventId,
  });
  return findEventByIdInSchool(db, ctx.schoolId, eventId);
}

// Publishes a draft event and materialises recipients from eligible pupils'
// single primary-contact guardians (decision 17.2). If a class was specified,
// only that class's pupils are included; otherwise the whole school.
export async function publishEvent(
  db: Db,
  ctx: StaffContext,
  eventId: string,
  options?: { classGroupId?: string | null },
) {
  requireCapability(ctx, "event.manage");
  const event = await requireEvent(db, ctx, eventId);
  assertTransition(event.status, "published");

  // Guard: cannot publish once the consent deadline has already passed.
  if (event.consentDeadline.getTime() <= Date.now()) {
    throw new ValidationError("Cannot publish: the consent deadline has already passed.");
  }

  const classGroupId = options?.classGroupId ?? null;
  if (classGroupId) {
    const cls = await findClassByIdInSchool(db, ctx.schoolId, classGroupId);
    if (!cls) throw new NotFoundError("Class not found in this school.");
  }

  const recipientCount = await prisma.$transaction(async (txRaw) => {
    const tx = txRaw as unknown as Db;
    const pairs = await findPrimaryContactPairs(tx, ctx.schoolId, classGroupId);
    if (pairs.length > 0) {
      await createRecipients(
        tx,
        pairs.map((p) => ({
          schoolId: ctx.schoolId,
          eventId,
          pupilId: p.pupilId,
          guardianId: p.guardianId,
        })),
      );
      // Schedule the consent request + deadline/event reminders for each
      // recipient (FR-06/FR-07). Idempotent by dedupe key. The worker issues a
      // fresh secure link at send time, so no token is generated here.
      await scheduleEventNotifications(tx, {
        schoolId: ctx.schoolId,
        eventId,
        consentDeadline: event.consentDeadline,
        eventStartsAt: event.startsAt,
        recipients: pairs,
      });
    }
    await updateEventScoped(tx, ctx.schoolId, eventId, {
      status: "published",
      publishedAt: new Date(),
    });
    return pairs.length;
  });

  await recordAudit(db, {
    schoolId: ctx.schoolId,
    actorType: "staff",
    actorId: ctx.staffUserId,
    action: "event.published",
    entityType: "Event",
    entityId: eventId,
    metadata: { recipientCount },
  });

  return { event: await findEventByIdInSchool(db, ctx.schoolId, eventId), recipientCount };
}

export async function cancelEvent(db: Db, ctx: StaffContext, eventId: string) {
  requireCapability(ctx, "event.manage");
  const event = await requireEvent(db, ctx, eventId);
  assertTransition(event.status, "cancelled");

  await prisma.$transaction(async (txRaw) => {
    const tx = txRaw as unknown as Db;
    await updateEventScoped(tx, ctx.schoolId, eventId, {
      status: "cancelled",
      cancelledAt: new Date(),
    });
    // Revoke outstanding secure links so a cancelled activity can no longer
    // accept consent (FR-04 / Journey F).
    await revokeTokensForEvent(tx, ctx.schoolId, eventId);
    // Suppress any still-pending reminders for the event (FR-07 / Journey F).
    await suppressPendingForEvent(tx, ctx.schoolId, eventId);
  });
  await recordAudit(db, {
    schoolId: ctx.schoolId,
    actorType: "staff",
    actorId: ctx.staffUserId,
    action: "event.cancelled",
    entityType: "Event",
    entityId: eventId,
  });
  return findEventByIdInSchool(db, ctx.schoolId, eventId);
}

export async function completeEvent(db: Db, ctx: StaffContext, eventId: string) {
  requireCapability(ctx, "event.manage");
  const event = await requireEvent(db, ctx, eventId);
  assertTransition(event.status, "completed");

  await updateEventScoped(db, ctx.schoolId, eventId, { status: "completed" });
  await recordAudit(db, {
    schoolId: ctx.schoolId,
    actorType: "staff",
    actorId: ctx.staffUserId,
    action: "event.completed",
    entityType: "Event",
    entityId: eventId,
  });
  return findEventByIdInSchool(db, ctx.schoolId, eventId);
}

// --- helpers ---------------------------------------------------------------

async function requireEvent(db: Db, ctx: StaffContext, eventId: string) {
  const event = await findEventByIdInSchool(db, ctx.schoolId, eventId);
  if (!event) throw new NotFoundError("Event not found.");
  return event;
}

function assertTransition(from: string, to: EventStatus) {
  if (!isEventStatus(from) || !canTransitionEvent(from, to)) {
    throw new ConflictError(`Cannot change event status from "${from}" to "${to}".`);
  }
}

function firstIssue(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? "Invalid event details.";
}
