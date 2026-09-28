// Minimal, dependency-free CSV parser (RFC 4180 subset): supports quoted
// fields, escaped quotes ("") inside quotes, commas and newlines within quotes,
// and CRLF/LF line endings. Sufficient for roster import; no streaming (import
// files are small in the MVP).
//
// Also tolerates tab-separated input: copying cells out of Excel/Google
// Sheets puts TSV (not CSV) on the clipboard, and staff pasting a roster
// directly from a spreadsheet is the expected workflow, not an edge case.

export function parseCsv(input: string, delimiter: "," | "\t" = ","): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let i = 0;
  // Strip a UTF-8 BOM if present.
  if (input.charCodeAt(0) === 0xfeff) i = 1;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  while (i < input.length) {
    const ch = input[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === delimiter) {
      pushField();
      i += 1;
      continue;
    }
    if (ch === "\r") {
      // Handle CRLF and lone CR.
      if (input[i + 1] === "\n") i += 1;
      pushRow();
      i += 1;
      continue;
    }
    if (ch === "\n") {
      pushRow();
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }

  // Flush the final field/row unless the input ended on a newline with nothing
  // pending.
  if (field.length > 0 || row.length > 0) {
    pushRow();
  }

  // Drop trailing fully-empty rows (e.g. a trailing newline).
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

// Picks comma vs tab for pasted roster content. Excel/Google Sheets put TSV
// on the clipboard when copying a cell range, so a tab-only first line (no
// commas at all) is treated as tab-delimited; anything else defaults to CSV.
export function detectDelimiter(input: string): "," | "\t" {
  const firstLine = input.split(/\r\n|\r|\n/, 1)[0] ?? "";
  if (firstLine.includes("\t") && !firstLine.includes(",")) return "\t";
  return ",";
}
