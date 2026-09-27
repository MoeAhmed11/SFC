// Roster CSV template. One row = one pupil + their single primary-contact
// guardian + class (primary-contact-only decision 17.2).

export const IMPORT_COLUMNS = [
  "pupil_first_name",
  "pupil_last_name",
  "pupil_external_ref", // optional; used for idempotent duplicate matching
  "class_name",
  "guardian_name",
  "guardian_email",
  "relationship", // optional, e.g. "Mother"
] as const;

export type ImportColumn = (typeof IMPORT_COLUMNS)[number];

// Downloadable template contents (header + one illustrative synthetic row).
export function importTemplateCsv(): string {
  const header = IMPORT_COLUMNS.join(",");
  const example = ["Alex", "Taylor", "P-1001", "Year 3", "Sam Taylor", "sam.taylor@example.test", "Parent"].join(
    ",",
  );
  return `${header}\n${example}\n`;
}

// Maps a parsed header row to column indexes, tolerating order and case, and
// reports any missing required columns.
export function resolveColumnIndexes(header: string[]): {
  indexes: Partial<Record<ImportColumn, number>>;
  missing: ImportColumn[];
} {
  const normalised = header.map((h) => h.trim().toLowerCase());
  const indexes: Partial<Record<ImportColumn, number>> = {};
  for (const col of IMPORT_COLUMNS) {
    const idx = normalised.indexOf(col);
    if (idx >= 0) indexes[col] = idx;
  }
  const requiredColumns: ImportColumn[] = [
    "pupil_first_name",
    "pupil_last_name",
    "class_name",
    "guardian_name",
    "guardian_email",
  ];
  const missing = requiredColumns.filter((c) => indexes[c] === undefined);
  return { indexes, missing };
}
