-- AlterTable
-- Adds explicit provenance to a consent response: "parent" (submitted by the
-- parent through their secure link — the default, and every existing row)
-- or "staff" (recorded on the parent's behalf from a paper form/phone call/
-- in-person conversation, decision 17.5, gated on School.settings'
-- allowOfflineConsent flag). recordedByStaffUserId is set only for the
-- latter. Both columns are backwards-compatible, non-breaking additions —
-- every existing response row defaults to source = "parent" with a null
-- recordedByStaffUserId, which is exactly what it should be.
ALTER TABLE "consent_responses" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'parent';
ALTER TABLE "consent_responses" ADD COLUMN "recordedByStaffUserId" TEXT;
