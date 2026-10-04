import type { Db } from "@/server/db";
import { prisma } from "@/server/db";
import { recordAudit } from "@/server/audit/audit";
import type { PupilStatus } from "@/server/domain";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { requireCapability, type StaffContext } from "@/server/tenancy/context";
import {
  createClassGroupSchema,
  createGuardianSchema,
  createPupilSchema,
  createRelationshipSchema,
  updateGuardianSchema,
  updatePupilSchema,
} from "@/server/validation";
import {
  createClassGroup,
  findClassByIdInSchool,
  findClassByNameInSchool,
  listClassesBySchool,
} from "@/server/repositories/classRepository";
import {
  createPupil,
  findPupilByIdInSchool,
  listPupilsBySchool,
  updatePupilScoped,
} from "@/server/repositories/pupilRepository";
import { listConsentHistoryForPupil } from "@/server/repositories/consentRepository";
import { listRecipientPairingsForPupil } from "@/server/repositories/eventRecipientRepository";
import {
  createGuardian,
  findGuardianByEmailInSchool,
  findGuardianByIdInSchool,
  listGuardiansBySchool,
  updateGuardianScoped,
} from "@/server/repositories/guardianRepository";
import {
  clearPrimaryForPupil,
  listRelationshipsForPupilWithGuardian,
  upsertRelationship,
} from "@/server/repositories/relationshipRepository";

// School data management (Section 6.1). Every mutation:
//  1. checks capability (RBAC),
//  2. is scoped to the actor's school,
//  3. writes an audit entry.
// Reads require the "data.view" capability (admins and organisers).

// --- Classes ---------------------------------------------------------------

export async function createClass(
  db: Db,
  ctx: StaffContext,
  input: { name: string; yearGroup?: string },
) {
  requireCapability(ctx, "data.manage");
  const parsed = createClassGroupSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError("Invalid class details.");

  const existing = await findClassByNameInSchool(db, ctx.schoolId, parsed.data.name);
  if (existing) throw new ConflictError("A class with this name already exists.");

  const created = await createClassGroup(db, {
    schoolId: ctx.schoolId,
    name: parsed.data.name,
    yearGroup: parsed.data.yearGroup ?? null,
  });
  await recordAudit(db, {
    schoolId: ctx.schoolId,
    actorType: "staff",
    actorId: ctx.staffUserId,
    action: "class.created",
    entityType: "ClassGroup",
    entityId: created.id,
  });
  return created;
}

export async function listClasses(db: Db, ctx: StaffContext) {
  requireCapability(ctx, "data.view");
  return listClassesBySchool(db, ctx.schoolId);
}

// --- Pupils -----------------------------------------------------------------

export async function createPupilRecord(
  db: Db,
  ctx: StaffContext,
  input: { firstName: string; lastName: string; classGroupId?: string; externalRef?: string },
) {
  requireCapability(ctx, "data.manage");
  const parsed = createPupilSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError("Invalid pupil details.");

  // If a class is given, it must belong to the same school (tenant guard).
  if (parsed.data.classGroupId) {
    const cls = await findClassByIdInSchool(db, ctx.schoolId, parsed.data.classGroupId);
    if (!cls) throw new NotFoundError("Class not found in this school.");
  }

  const created = await createPupil(db, {
    schoolId: ctx.schoolId,
    firstName: parsed.data.firstName,
    lastName: parsed.data.lastName,
    classGroupId: parsed.data.classGroupId ?? null,
    externalRef: parsed.data.externalRef ?? null,
  });
  await recordAudit(db, {
    schoolId: ctx.schoolId,
    actorType: "staff",
    actorId: ctx.staffUserId,
    action: "pupil.created",
    entityType: "Pupil",
    entityId: created.id,
  });
  return created;
}

export async function listPupils(
  db: Db,
  ctx: StaffContext,
  filter: { classGroupId?: string; status?: PupilStatus } = {},
) {
  requireCapability(ctx, "data.view");
  return listPupilsBySchool(db, ctx.schoolId, filter);
}

export async function getPupil(db: Db, ctx: StaffContext, pupilId: string) {
  requireCapability(ctx, "data.view");
  const pupil = await findPupilByIdInSchool(db, ctx.schoolId, pupilId);
  if (!pupil) throw new NotFoundError("Pupil not found.");
  return pupil;
}

// Every consent response for a pupil across ALL events, including superseded
// rows (Requirement 2) — the full history of changes of mind, not just the
// current answer per event. Same capability as viewing the pupil themselves.
export async function getPupilConsentHistory(db: Db, ctx: StaffContext, pupilId: string) {
  requireCapability(ctx, "data.view");
  const pupil = await findPupilByIdInSchool(db, ctx.schoolId, pupilId);
  if (!pupil) throw new NotFoundError("Pupil not found.");
  return listConsentHistoryForPupil(db, ctx.schoolId, pupilId);
}

// Every event+guardian pairing a pupil is registered for (Requirement 3) —
// used to offer a "resend consent link" action per pairing on the pupil
// detail page. Same capability as viewing the pupil.
export async function getPupilEventRecipients(db: Db, ctx: StaffContext, pupilId: string) {
  requireCapability(ctx, "data.view");
  const pupil = await findPupilByIdInSchool(db, ctx.schoolId, pupilId);
  if (!pupil) throw new NotFoundError("Pupil not found.");
  return listRecipientPairingsForPupil(db, ctx.schoolId, pupilId);
}

// Every guardian linked to a pupil, with contact details and relationship
// flags, for the pupil detail page's guardian edit section. Same capability
// (and tenant guard) as viewing the pupil itself.
export async function getPupilGuardians(db: Db, ctx: StaffContext, pupilId: string) {
  requireCapability(ctx, "data.view");
  const pupil = await findPupilByIdInSchool(db, ctx.schoolId, pupilId);
  if (!pupil) throw new NotFoundError("Pupil not found.");
  return listRelationshipsForPupilWithGuardian(db, ctx.schoolId, pupilId);
}

// Edits a pupil's roster details (Requirement 1). externalRef is never
// accepted here — updatePupilSchema has no such field — so it can never be
// changed through this path, only set at CSV-import time.
export async function updatePupil(
  db: Db,
  ctx: StaffContext,
  pupilId: string,
  input: { firstName?: string; lastName?: string; classGroupId?: string | null; status?: PupilStatus },
) {
  requireCapability(ctx, "data.manage");
  const parsed = updatePupilSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError("Invalid pupil details.");

  const existing = await findPupilByIdInSchool(db, ctx.schoolId, pupilId);
  if (!existing) throw new NotFoundError("Pupil not found.");

  // If a class is given (and non-null), it must belong to the same school
  // (tenant guard) — mirrors createPupilRecord's check above.
  if (parsed.data.classGroupId) {
    const cls = await findClassByIdInSchool(db, ctx.schoolId, parsed.data.classGroupId);
    if (!cls) throw new NotFoundError("Class not found in this school.");
  }

  const count = await updatePupilScoped(db, ctx.schoolId, pupilId, parsed.data);
  if (count === 0) throw new NotFoundError("Pupil not found.");

  await recordAudit(db, {
    schoolId: ctx.schoolId,
    actorType: "staff",
    actorId: ctx.staffUserId,
    action: "pupil.updated",
    entityType: "Pupil",
    entityId: pupilId,
    metadata: parsed.data,
  });
}

// "Deleting" a pupil archives them (status -> "archived") rather than
// removing the row, preserving consent/event history (Requirement 1.4).
// True hard-delete is a distinct, separate action, not exposed here.
export async function archivePupil(db: Db, ctx: StaffContext, pupilId: string) {
  requireCapability(ctx, "data.manage");

  const count = await updatePupilScoped(db, ctx.schoolId, pupilId, { status: "archived" });
  if (count === 0) throw new NotFoundError("Pupil not found.");

  await recordAudit(db, {
    schoolId: ctx.schoolId,
    actorType: "staff",
    actorId: ctx.staffUserId,
    action: "pupil.archived",
    entityType: "Pupil",
    entityId: pupilId,
  });
}

// --- Guardians --------------------------------------------------------------

export async function createGuardianRecord(
  db: Db,
  ctx: StaffContext,
  input: { name: string; email: string },
) {
  requireCapability(ctx, "data.manage");
  const parsed = createGuardianSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError("Invalid guardian details.");

  const existing = await findGuardianByEmailInSchool(db, ctx.schoolId, parsed.data.email);
  if (existing) throw new ConflictError("A guardian with this email already exists.");

  const created = await createGuardian(db, {
    schoolId: ctx.schoolId,
    name: parsed.data.name,
    email: parsed.data.email,
  });
  await recordAudit(db, {
    schoolId: ctx.schoolId,
    actorType: "staff",
    actorId: ctx.staffUserId,
    action: "guardian.created",
    entityType: "Guardian",
    entityId: created.id,
  });
  return created;
}

export async function listGuardians(db: Db, ctx: StaffContext) {
  requireCapability(ctx, "data.view");
  return listGuardiansBySchool(db, ctx.schoolId);
}

// Edits a guardian's contact details (name/email). Mirrors updatePupil's
// shape: tenant-checked, partial input, audited. Email changes are
// re-checked for per-school uniqueness, excluding the guardian's own
// existing row, mirroring createGuardianRecord's uniqueness check above.
export async function updateGuardian(
  db: Db,
  ctx: StaffContext,
  guardianId: string,
  input: { name?: string; email?: string },
) {
  requireCapability(ctx, "data.manage");
  const parsed = updateGuardianSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError("Invalid guardian details.");

  const existing = await findGuardianByIdInSchool(db, ctx.schoolId, guardianId);
  if (!existing) throw new NotFoundError("Guardian not found.");

  if (parsed.data.email && parsed.data.email !== existing.email) {
    const emailTaken = await findGuardianByEmailInSchool(db, ctx.schoolId, parsed.data.email);
    if (emailTaken) throw new ConflictError("A guardian with this email already exists.");
  }

  const count = await updateGuardianScoped(db, ctx.schoolId, guardianId, parsed.data);
  if (count === 0) throw new NotFoundError("Guardian not found.");

  await recordAudit(db, {
    schoolId: ctx.schoolId,
    actorType: "staff",
    actorId: ctx.staffUserId,
    action: "guardian.updated",
    entityType: "Guardian",
    entityId: guardianId,
    metadata: parsed.data,
  });
}

// --- Relationships ----------------------------------------------------------

// Links a guardian to a pupil. Enforces the primary-contact-only rule (17.2):
// at most one primary contact per pupil. Setting a new primary clears any
// existing one, done in a transaction for consistency.
export async function linkGuardianToPupil(
  db: Db,
  ctx: StaffContext,
  input: {
    pupilId: string;
    guardianId: string;
    relationship?: string;
    isAuthorised?: boolean;
    isPrimaryContact?: boolean;
  },
) {
  requireCapability(ctx, "data.manage");
  const parsed = createRelationshipSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError("Invalid relationship details.");

  // Both ends must belong to the actor's school (tenant guard).
  const pupil = await findPupilByIdInSchool(db, ctx.schoolId, parsed.data.pupilId);
  if (!pupil) throw new NotFoundError("Pupil not found in this school.");
  const guardian = await findGuardianByIdInSchool(db, ctx.schoolId, parsed.data.guardianId);
  if (!guardian) throw new NotFoundError("Guardian not found in this school.");

  const relationship = await runInTransaction(db, async (tx) => {
    if (parsed.data.isPrimaryContact) {
      await clearPrimaryForPupil(tx, ctx.schoolId, parsed.data.pupilId);
    }
    return upsertRelationship(tx, {
      schoolId: ctx.schoolId,
      pupilId: parsed.data.pupilId,
      guardianId: parsed.data.guardianId,
      relationship: parsed.data.relationship ?? null,
      isAuthorised: parsed.data.isAuthorised,
      isPrimaryContact: parsed.data.isPrimaryContact,
    });
  });

  await recordAudit(db, {
    schoolId: ctx.schoolId,
    actorType: "staff",
    actorId: ctx.staffUserId,
    action: "relationship.linked",
    entityType: "PupilGuardianRelationship",
    entityId: relationship.id,
    metadata: { primary: relationship.isPrimaryContact },
  });
  return relationship;
}

// Runs work in a transaction. Accepts an existing tx client (passes through) or
// starts one on the base prisma client.
async function runInTransaction<T>(db: Db, work: (tx: Db) => Promise<T>): Promise<T> {
  // If db is already a transaction client it has no $transaction; detect and
  // fall back to using it directly.
  const maybeTx = db as unknown as { $transaction?: unknown };
  if (typeof maybeTx.$transaction !== "function") {
    return work(db);
  }
  return prisma.$transaction((tx) => work(tx as unknown as Db));
}
