// Shared status pill used across event and staff/response tables so the same
// status always looks the same. Colour is paired with the status text (never
// colour alone) per ACCESSIBILITY_CHECKLIST.md.
const VARIANT: Record<string, string> = {
  // event lifecycle
  draft: "badge--neutral",
  published: "badge--info",
  completed: "badge--success",
  cancelled: "badge--danger",
  // consent / response
  granted: "badge--success",
  consented: "badge--success",
  declined: "badge--danger",
  invited: "badge--info",
  outstanding: "badge--warning",
  pending: "badge--warning",
  // consent history state (current vs superseded — Requirement 2)
  current: "badge--info",
  superseded: "badge--neutral",
  // staff / pupils
  active: "badge--success",
  deactivated: "badge--neutral",
  archived: "badge--neutral",
};

export function StatusBadge({ status }: { status: string }) {
  const variant = VARIANT[status.toLowerCase()] ?? "badge--neutral";
  return <span className={`badge ${variant}`}>{status}</span>;
}
