import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { canTransitionEvent } from "@/server/domain";
import {
  cancelEvent,
  completeEvent,
  createEventDraft,
  editEvent,
  publishEvent,
} from "@/server/services/eventService";
import {
  listRecipientsForEvent,
  countRecipientsForEvent,
} from "@/server/repositories/eventRecipientRepository";
import {
  createSchoolWithAdmin,
  createPupilWithPrimaryGuardian,
  ctxFor,
  futureEventDates,
  resetDb,
} from "./helpers";

describe("event status transition matrix", () => {
  it("allows only valid transitions", () => {
    expect(canTransitionEvent("draft", "published")).toBe(true);
    expect(canTransitionEvent("draft", "cancelled")).toBe(true);
    expect(canTransitionEvent("published", "completed")).toBe(true);
    expect(canTransitionEvent("published", "cancelled")).toBe(true);
    // Invalid / terminal.
    expect(canTransitionEvent("draft", "completed")).toBe(false);
    expect(canTransitionEvent("cancelled", "published")).toBe(false);
    expect(canTransitionEvent("completed", "cancelled")).toBe(false);
  });
});

describe("event date/deadline validation", () => {
  beforeEach(resetDb);

  it("rejects an event whose end is before its start", async () => {
    const { adminCtx } = await createSchoolWithAdmin();
    const d = futureEventDates();
    await expect(
      createEventDraft(prisma, adminCtx, {
        title: "Trip",
        startsAt: d.endsAt, // swapped
        endsAt: d.startsAt,
        consentDeadline: d.consentDeadline,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects a consent deadline after the event start", async () => {
    const { adminCtx } = await createSchoolWithAdmin();
    const d = futureEventDates();
    await expect(
      createEventDraft(prisma, adminCtx, {
        title: "Trip",
        startsAt: d.startsAt,
        endsAt: d.endsAt,
        consentDeadline: new Date(d.startsAt.getTime() + 3600 * 1000), // after start
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("accepts coherent dates and starts as draft", async () => {
    const { adminCtx } = await createSchoolWithAdmin();
    const event = await createEventDraft(prisma, adminCtx, { title: "Trip", ...futureEventDates() });
    expect(event.status).toBe("draft");
  });
});

describe("event lifecycle", () => {
  beforeEach(resetDb);

  it("publishes a draft and generates recipients from primary contacts only", async () => {
    const { adminCtx } = await createSchoolWithAdmin();
    const { classId, guardianId } = await createPupilWithPrimaryGuardian(adminCtx, {
      className: "Year 4",
    });
    // A second, non-primary guardian on another pupil must NOT be a recipient.
    const { createPupilRecord, createGuardianRecord, linkGuardianToPupil } = await import(
      "@/server/services/dataService"
    );
    const pupil2 = await createPupilRecord(prisma, adminCtx, {
      firstName: "No",
      lastName: "Primary",
      classGroupId: classId,
    });
    const g2 = await createGuardianRecord(prisma, adminCtx, { name: "NP", email: "np@example.test" });
    await linkGuardianToPupil(prisma, adminCtx, {
      pupilId: pupil2.id,
      guardianId: g2.id,
      isPrimaryContact: false,
    });

    const event = await createEventDraft(prisma, adminCtx, { title: "Trip", ...futureEventDates() });
    const { recipientCount } = await publishEvent(prisma, adminCtx, event.id, { classGroupId: classId });

    expect(recipientCount).toBe(1);
    const recipients = await listRecipientsForEvent(prisma, adminCtx.schoolId, event.id);
    expect(recipients).toHaveLength(1);
    expect(recipients[0]?.guardianId).toBe(guardianId);
  });

  it("cannot publish twice (invalid transition)", async () => {
    const { adminCtx } = await createSchoolWithAdmin();
    const { classId } = await createPupilWithPrimaryGuardian(adminCtx);
    const event = await createEventDraft(prisma, adminCtx, { title: "Trip", ...futureEventDates() });
    await publishEvent(prisma, adminCtx, event.id, { classGroupId: classId });
    await expect(publishEvent(prisma, adminCtx, event.id, { classGroupId: classId })).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("cannot edit a published event", async () => {
    const { adminCtx } = await createSchoolWithAdmin();
    const { classId } = await createPupilWithPrimaryGuardian(adminCtx);
    const event = await createEventDraft(prisma, adminCtx, { title: "Trip", ...futureEventDates() });
    await publishEvent(prisma, adminCtx, event.id, { classGroupId: classId });
    await expect(editEvent(prisma, adminCtx, event.id, { title: "New" })).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("can cancel a published event; completed is terminal", async () => {
    const { adminCtx } = await createSchoolWithAdmin();
    const { classId } = await createPupilWithPrimaryGuardian(adminCtx);
    const event = await createEventDraft(prisma, adminCtx, { title: "Trip", ...futureEventDates() });
    await publishEvent(prisma, adminCtx, event.id, { classGroupId: classId });

    const completed = await completeEvent(prisma, adminCtx, event.id);
    expect(completed?.status).toBe("completed");
    // Cancelling a completed event is not allowed.
    await expect(cancelEvent(prisma, adminCtx, event.id)).rejects.toBeInstanceOf(ConflictError);
  });

  it("refuses to publish when the deadline has already passed", async () => {
    const { adminCtx } = await createSchoolWithAdmin();
    // Build a draft with a past deadline directly (bypassing create validation
    // which forbids it) to simulate time passing after creation.
    const d = futureEventDates();
    const event = await createEventDraft(prisma, adminCtx, { title: "Trip", ...d });
    await prisma.event.update({
      where: { id: event.id },
      data: { consentDeadline: new Date(Date.now() - 1000) },
    });
    await expect(publishEvent(prisma, adminCtx, event.id)).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("event RBAC and tenant isolation", () => {
  beforeEach(resetDb);

  it("organiser can manage events", async () => {
    const { school, adminCtx } = await createSchoolWithAdmin();
    // Create a real organiser staff member (events reference createdById).
    const { inviteStaff, activateWithPassword } = await import("@/server/services/staffAdminService");
    const organiser = await inviteStaff(prisma, adminCtx, {
      name: "Org",
      email: "org@example.test",
      role: "organiser",
    });
    await activateWithPassword(prisma, school.id, organiser.id, { password: "organiser-pass-123" });
    const organiserCtx = ctxFor(school.id, organiser.id, "organiser");

    const event = await createEventDraft(prisma, organiserCtx, { title: "Trip", ...futureEventDates() });
    expect(event.status).toBe("draft");
  });

  it("cannot access an event from another school", async () => {
    const a = await createSchoolWithAdmin("School A");
    const b = await createSchoolWithAdmin("School B");
    const event = await createEventDraft(prisma, a.adminCtx, { title: "A Trip", ...futureEventDates() });

    await expect(cancelEvent(prisma, b.adminCtx, event.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(await countRecipientsForEvent(prisma, b.school.id, event.id)).toBe(0);
  });

  it("rejects publishing to a class from another school", async () => {
    const a = await createSchoolWithAdmin("School A");
    const b = await createSchoolWithAdmin("School B");
    const { classId: classB } = await createPupilWithPrimaryGuardian(b.adminCtx);
    const event = await createEventDraft(prisma, a.adminCtx, { title: "A Trip", ...futureEventDates() });
    await expect(publishEvent(prisma, a.adminCtx, event.id, { classGroupId: classB })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
