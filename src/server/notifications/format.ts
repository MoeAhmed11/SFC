// Formats a UTC instant for display in the school's IANA timezone (DST-correct
// via Intl). Used in email templates so dates read correctly for the school.
export function makeDateFormatter(timezone: string): (d: Date) => string {
  return (d: Date) => {
    try {
      return new Intl.DateTimeFormat("en-GB", {
        timeZone: timezone,
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(d);
    } catch {
      // Fall back to a fixed timezone if the configured one is invalid.
      return new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/London",
        dateStyle: "medium",
        timeStyle: "short",
      }).format(d);
    }
  };
}
