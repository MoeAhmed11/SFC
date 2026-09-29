-- AlterTable
-- Adds an explicit, staff-set flag distinguishing a deliberately reissued
-- consent link (Requirement 3 of the MVP admin & consent enhancements spec)
-- from a normally bulk-issued one. Only the staff-facing reissueLink() sets
-- this true; every existing/normal token defaults to false, so this is a
-- backwards-compatible, non-breaking column addition.
ALTER TABLE "secure_access_tokens" ADD COLUMN "deadlineExempt" BOOLEAN NOT NULL DEFAULT false;
