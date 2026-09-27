// School settings are stored as a JSON string on School.settings. This module
// parses them safely and provides typed access with defaults that reflect the
// resolved product decisions (17.3–17.5): late/edited/offline consent are
// DISABLED by default. Retention (17.9) defaults to 3 years and is
// configurable per school.

export const DEFAULT_RETENTION_YEARS = 3;
export const MIN_RETENTION_YEARS = 1;
export const MAX_RETENTION_YEARS = 10;

export interface SchoolSettings {
  // Whether a parent may change a previously submitted response (decision 17.4).
  allowConsentEditing: boolean;
  // Whether consent may be submitted after the deadline (decision 17.3).
  allowLateConsent: boolean;
  // Whether staff may record offline/paper consent (decision 17.5).
  allowOfflineConsent: boolean;
  // How many years to retain consent responses, notifications, and audit log
  // entries after their anchor date, before they are eligible for deletion
  // (decision 17.9). Retention is a data-protection commitment, not merely a
  // technical setting — do not lower it without appropriate advice.
  dataRetentionYears: number;
}

export const DEFAULT_SCHOOL_SETTINGS: SchoolSettings = {
  allowConsentEditing: false,
  allowLateConsent: false,
  allowOfflineConsent: false,
  dataRetentionYears: DEFAULT_RETENTION_YEARS,
};

function sanitiseRetentionYears(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_RETENTION_YEARS;
  const rounded = Math.round(value);
  if (rounded < MIN_RETENTION_YEARS) return MIN_RETENTION_YEARS;
  if (rounded > MAX_RETENTION_YEARS) return MAX_RETENTION_YEARS;
  return rounded;
}

export function parseSchoolSettings(raw: string | null | undefined): SchoolSettings {
  if (!raw) return { ...DEFAULT_SCHOOL_SETTINGS };
  try {
    const parsed = JSON.parse(raw) as Partial<SchoolSettings>;
    return {
      allowConsentEditing: parsed.allowConsentEditing === true,
      allowLateConsent: parsed.allowLateConsent === true,
      allowOfflineConsent: parsed.allowOfflineConsent === true,
      dataRetentionYears: sanitiseRetentionYears(parsed.dataRetentionYears),
    };
  } catch {
    return { ...DEFAULT_SCHOOL_SETTINGS };
  }
}
