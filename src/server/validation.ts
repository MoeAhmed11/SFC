import { z } from "zod";
import { CONSENT_RESPONSES, PUPIL_STATUSES, SCHOOL_TYPES, STAFF_ROLES } from "@/server/domain";

// Shared input validation (Section 11 Security: input validation). Emails are
// normalised to lower-case + trimmed so tenant-scoped uniqueness is consistent.

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("A valid email address is required.")
  .max(254);

// Classic complexity policy (Requirement 6): minimum length plus at least one
// character from each of four classes. superRefine (not chained .refine) is
// used deliberately so EVERY missing rule is reported at once, rather than
// only the first failing check — a user missing both a digit and a symbol
// should see both messages, not just the first one found.
export const passwordSchema = z
  .string()
  .min(12, "Password must be at least 12 characters.")
  .max(200)
  .superRefine((value, ctx) => {
    if (!/[a-z]/.test(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Password must include a lowercase letter.",
      });
    }
    if (!/[A-Z]/.test(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Password must include an uppercase letter.",
      });
    }
    if (!/[0-9]/.test(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Password must include a digit.",
      });
    }
    if (!/[^A-Za-z0-9]/.test(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Password must include a symbol.",
      });
    }
  });

export const staffRoleSchema = z.enum(STAFF_ROLES);
export const schoolTypeSchema = z.enum(SCHOOL_TYPES);

export const createSchoolSchema = z.object({
  name: z.string().trim().min(1).max(200),
  schoolType: schoolTypeSchema,
  timezone: z.string().trim().min(1).max(64).default("Europe/London"),
});

export const inviteStaffSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: emailSchema,
  role: staffRoleSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
});

export const setPasswordSchema = z.object({
  password: passwordSchema,
});

export const changeRoleSchema = z.object({
  role: staffRoleSchema,
});

// --- Phase 2: school data ---------------------------------------------------

const trimmedName = (max: number) => z.string().trim().min(1).max(max);

export const createClassGroupSchema = z.object({
  name: trimmedName(120),
  yearGroup: z.string().trim().max(40).optional(),
});

export const createPupilSchema = z.object({
  firstName: trimmedName(80),
  lastName: trimmedName(80),
  classGroupId: z.string().trim().min(1).optional(),
  externalRef: z.string().trim().max(80).optional(),
});

// Pupil roster editing (Requirement 1 of the MVP admin & consent enhancements
// spec). externalRef is deliberately NOT a field here at all — it's the
// school's own CSV-import matching key, so it is displayed but never
// editable. Omitting it from the schema means it can never be accepted even
// if a client sends it, rather than silently accepting-then-ignoring it.
// classGroupId accepts null to explicitly clear a pupil's class.
export const updatePupilSchema = z.object({
  firstName: trimmedName(80).optional(),
  lastName: trimmedName(80).optional(),
  classGroupId: z.string().trim().min(1).nullable().optional(),
  status: z.enum(PUPIL_STATUSES).optional(),
});

export const createGuardianSchema = z.object({
  name: trimmedName(120),
  email: emailSchema,
});

export const createRelationshipSchema = z.object({
  pupilId: z.string().trim().min(1),
  guardianId: z.string().trim().min(1),
  relationship: z.string().trim().max(60).optional(),
  isAuthorised: z.boolean().default(true),
  isPrimaryContact: z.boolean().default(false),
});

// One CSV import row (roster row): a pupil plus their single primary-contact
// guardian and class. This matches the primary-contact-only decision (17.2):
// import captures exactly one guardian per pupil, flagged primary.
export const importRowSchema = z.object({
  pupilFirstName: trimmedName(80),
  pupilLastName: trimmedName(80),
  pupilExternalRef: z.string().trim().max(80).optional().or(z.literal("").transform(() => undefined)),
  className: trimmedName(120),
  guardianName: trimmedName(120),
  guardianEmail: emailSchema,
  relationship: z.string().trim().max(60).optional().or(z.literal("").transform(() => undefined)),
});

export type ImportRow = z.infer<typeof importRowSchema>;

// --- Phase 3: events --------------------------------------------------------

// Accepts a Date or an ISO string and coerces to Date; rejects invalid dates.
const dateInput = z.coerce.date({
  errorMap: () => ({ message: "A valid date/time is required." }),
});

// Base object fields for an event.
const eventBase = {
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional(),
  location: z.string().trim().max(300).optional(),
  startsAt: dateInput,
  endsAt: dateInput,
  consentDeadline: dateInput,
  classGroupId: z.string().trim().min(1).optional(),
};

// Coherence rules (FR-02): start before end, and the consent deadline on or
// before the event start (you cannot consent after the activity begins).
function coherentDates<T extends { startsAt: Date; endsAt: Date; consentDeadline: Date }>(
  data: T,
  ctx: z.RefinementCtx,
) {
  if (data.startsAt.getTime() >= data.endsAt.getTime()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["endsAt"],
      message: "Event end must be after its start.",
    });
  }
  if (data.consentDeadline.getTime() > data.startsAt.getTime()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["consentDeadline"],
      message: "Consent deadline must be on or before the event start.",
    });
  }
}

export const createEventSchema = z.object(eventBase).superRefine(coherentDates);

// Edit allows partial fields, but if the trio of dates is present it must stay
// coherent. Require all three together when any date is supplied.
export const editEventSchema = z
  .object({
    title: eventBase.title.optional(),
    description: eventBase.description,
    location: eventBase.location,
    startsAt: dateInput.optional(),
    endsAt: dateInput.optional(),
    consentDeadline: dateInput.optional(),
    classGroupId: eventBase.classGroupId,
  })
  .superRefine((data, ctx) => {
    const anyDate = data.startsAt || data.endsAt || data.consentDeadline;
    const allDates = data.startsAt && data.endsAt && data.consentDeadline;
    if (anyDate && !allDates) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["startsAt"],
        message: "Provide startsAt, endsAt, and consentDeadline together when changing dates.",
      });
      return;
    }
    if (allDates) {
      coherentDates(
        { startsAt: data.startsAt!, endsAt: data.endsAt!, consentDeadline: data.consentDeadline! },
        ctx,
      );
    }
  });

// --- Phase 4: consent submission --------------------------------------------

export const consentSubmissionSchema = z.object({
  response: z.enum(CONSENT_RESPONSES),
  notes: z.string().trim().max(2000).optional(),
});
