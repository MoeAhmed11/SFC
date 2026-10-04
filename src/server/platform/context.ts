// The authenticated actor for the platform (super-user) layer. Deliberately
// NOT a StaffContext: a PlatformUser has no schoolId and no StaffRole — it is
// a wholly separate account type that sits above every tenant rather than
// inside one (see prisma/schema.prisma's PlatformUser comment).
//
// There is exactly one platform role today, so unlike tenancy/context.ts
// there is no capability matrix: any authenticated PlatformContext may create
// schools/first admins and view read-only usage counts, and nothing else —
// routes/services that need tenant data (pupils, guardians, consent, etc.)
// never accept a PlatformContext at all, so there is no risk of a platform
// user reaching into a school's operational data.
export interface PlatformContext {
  readonly platformUserId: string;
}
