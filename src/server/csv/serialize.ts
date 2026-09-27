// Minimal CSV serializer (RFC 4180 subset), the counterpart to csv/parse.ts.
// Quotes a field when it contains a comma, quote, or newline, and escapes
// embedded quotes by doubling them.

function serializeField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function toCsv(header: string[], rows: string[][]): string {
  const lines = [header, ...rows].map((row) => row.map(serializeField).join(","));
  // Trailing newline for POSIX-friendliness.
  return `${lines.join("\r\n")}\r\n`;
}
