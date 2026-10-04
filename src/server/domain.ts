// Shared domain constants and types for Phase 1.
//
// Enums are represented as string unions here and stored as String columns
// (see schema.prisma). Validation happens in the application layer so the
// schema stays portable between SQLite (dev/test) and PostgreSQL (production).

export const STAFF_ROLES = ["admin", "organiser"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const STAFF_STATUSES = ["invited", "active", "deactivated"] as const;
export type StaffStatus = (typeof STAFF_STATUSES)[number];

export const SCHOOL_TYPES = ["state", "independent"] as const;
export type SchoolType = (typeof SCHOOL_TYPES)[number];

export function isSchoolType(value: unknown): value is SchoolType {
  return typeof value === "string" && (SCHOOL_TYPES as readonly string[]).includes(value);
}

export const ACTOR_TYPES = ["staff", "system", "parent"] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

export function isStaffRole(value: unknown): value is StaffRole {
  return typeof value === "string" && (STAFF_ROLES as readonly string[]).includes(value);
}

// Capabilities model (RBAC). Kept as an explicit matrix so permission checks
// are declarative and testable (Section 18.6 role permissions).
export const CAPABILITIES = [
  "staff.invite",
  "staff.deactivate",
  "staff.change_role",
  "staff.list",
  "event.manage", // create/edit/publish/cancel — used from Phase 3 onward
  "event.view",
  // Phase 2: school data management (classes, pupils, guardians, relationships,
  // CSV import). Managing school records is an administrative responsibility
  // (Section 5.1); organisers may view rosters to run events (Section 5.2).
  "data.manage",
  "data.view",
  "data.import",
  // Phase 7: school policy settings (consent editing / late / offline flags).
  // These change legal/consent behaviour, so they are admin-only (Section 5.1).
  "school.manage_settings",
  // MVP admin & consent enhancements (see .kiro/specs/mvp-admin-consent-enhancements):
  // Pupil edit/archive reuses "data.manage" (already admin-only) rather than a
  // new capability, for consistency with the rest of dataService.ts (classes,
  // guardians, relationships all gate on data.manage/data.view already).
  "consent.resend", // reissue/resend an individual consent link — admin + organiser
  "staff.delete", // hard-delete a staff user (conditional on no created events) — admin only
  "staff.reset_password", // admin-triggered password reset link for another staff user — admin only
  "audit.view", // audit log viewer — admin only
  // Record a parent's consent decision given offline (paper form, phone call,
  // in person) on their behalf — decision 17.5, gated on the school's
  // allowOfflineConsent setting. Same admin + organiser split as
  // consent.resend: both run events day-to-day and may need this.
  "consent.record_offline",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

const ROLE_CAPABILITIES: Record<StaffRole, ReadonlySet<Capability>> = {
  admin: new Set<Capability>([
    "staff.invite",
    "staff.deactivate",
    "staff.change_role",
    "staff.list",
    "event.manage",
    "event.view",
    "data.manage",
    "data.view",
    "data.import",
    "school.manage_settings",
    "consent.resend",
    "staff.delete",
    "staff.reset_password",
    "audit.view",
    "consent.record_offline",
  ]),
  // Event organisers manage events and view rosters, but cannot administer
  // staff, mutate/import core school data, or change school policy (Section 5.2).
  // They can, however, resend/reissue an individual consent link (Requirement 3
  // in the MVP enhancements spec), and record offline consent, since both are
  // part of running their events day-to-day.
  organiser: new Set<Capability>([
    "event.manage",
    "event.view",
    "data.view",
    "consent.resend",
    "consent.record_offline",
  ]),
};

export const PUPIL_STATUSES = ["active", "archived"] as const;
export type PupilStatus = (typeof PUPIL_STATUSES)[number];

export function isPupilStatus(value: unknown): value is PupilStatus {
  return typeof value === "string" && (PUPIL_STATUSES as readonly string[]).includes(value);
}

export const GUARDIAN_STATUSES = ["active", "archived"] as const;
export type GuardianStatus = (typeof GUARDIAN_STATUSES)[number];

// --- Events (Phase 3) -------------------------------------------------------

export const EVENT_STATUSES = ["draft", "published", "cancelled", "completed"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

// Allowed status transitions (FR-02). A draft can be published or cancelled; a
// published event can be cancelled or completed; cancelled/completed are
// terminal.
const EVENT_TRANSITIONS: Record<EventStatus, ReadonlySet<EventStatus>> = {
  draft: new Set<EventStatus>(["published", "cancelled"]),
  published: new Set<EventStatus>(["cancelled", "completed"]),
  cancelled: new Set<EventStatus>(),
  completed: new Set<EventStatus>(),
};

export function canTransitionEvent(from: EventStatus, to: EventStatus): boolean {
  return EVENT_TRANSITIONS[from].has(to);
}

export function isEventStatus(value: unknown): value is EventStatus {
  return typeof value === "string" && (EVENT_STATUSES as readonly string[]).includes(value);
}

// --- Consent & secure links (Phase 4) ---------------------------------------

export const CONSENT_RESPONSES = ["granted", "declined"] as const;
export type ConsentResponseValue = (typeof CONSENT_RESPONSES)[number];

export function isConsentResponse(value: unknown): value is ConsentResponseValue {
  return typeof value === "string" && (CONSENT_RESPONSES as readonly string[]).includes(value);
}

export const TOKEN_ACTIONS = ["consent"] as const;
export type TokenAction = (typeof TOKEN_ACTIONS)[number];

// Default secure-link lifetime: tokens are valid until shortly after the event
// so a parent can still act around the day itself, but not indefinitely.
export const TOKEN_TTL_DAYS = 90;

// Staff invite-acceptance tokens expire sooner than parent links — an invite
// is expected to be acted on promptly, and a long-lived unused invite is an
// unnecessary standing credential.
export const INVITE_TOKEN_TTL_DAYS = 7;

// Password reset tokens (Requirement 7 of the MVP admin & consent enhancements
// spec) expire much sooner than an invite — this is a recovery path for an
// already-active account, not an onboarding step, so a short window limits
// how long a leaked/intercepted reset link stays usable.
export const PASSWORD_RESET_TOKEN_TTL_MINUTES = 60;

// --- Notifications (Phase 6) ------------------------------------------------

export const NOTIFICATION_TYPES = [
  "consent_request",
  "deadline_reminder",
  "event_reminder",
  "change_notice",
  "confirmation",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_STATUSES = ["scheduled", "sent", "failed", "cancelled"] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

// Default deadline-reminder offsets in days before the consent deadline
// (FR-06 suggested defaults; configurable per school/event later).
export const DEFAULT_DEADLINE_REMINDER_OFFSET_DAYS = [7, 3, 1] as const;

// Default event-reminder lead time in days before the event (FR-07 default).
export const DEFAULT_EVENT_REMINDER_OFFSET_DAYS = 1;

// Max delivery attempts before a notification is left as "failed" for admin
// visibility (Section 11 reliability).
export const MAX_NOTIFICATION_ATTEMPTS = 5;

export function roleHasCapability(role: StaffRole, capability: Capability): boolean {
  return ROLE_CAPABILITIES[role].has(capability);
}
