import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { getStaffContext } from "@/server/http/session";
import { listPupils, listClasses } from "@/server/services/dataService";
import { isPupilStatus, type PupilStatus } from "@/server/domain";
import { StaffNav } from "../StaffNav";
import { StatusBadge } from "../StatusBadge";
import { PupilFilters } from "./PupilFilters";

interface PageProps {
  searchParams: Promise<{ classGroupId?: string; status?: string }>;
}

export default async function PupilsListPage({ searchParams }: PageProps) {
  const ctx = await getStaffContext();
  if (!ctx) redirect("/login");

  const { classGroupId, status: rawStatus } = await searchParams;
  // Default to "active" so archived pupils don't clutter the roster unless
  // explicitly requested (Requirement 1.5).
  const status: PupilStatus | undefined = rawStatus === "all" ? undefined : isPupilStatus(rawStatus) ? rawStatus : "active";

  const [pupils, classes] = await Promise.all([
    listPupils(prisma, ctx, { classGroupId: classGroupId || undefined, status }),
    listClasses(prisma, ctx),
  ]);
  const classNameById = new Map(classes.map((c) => [c.id, c.name]));

  // Active-filter chips (audit finding: no confirmation that filters are
  // applied). Each chip links back to the current filters minus itself, so
  // it doubles as a "remove this filter" control.
  const effectiveStatus = rawStatus ?? "active";
  const activeFilterChips: { key: string; label: string; clearHref: string }[] = [];
  if (classGroupId) {
    const params = new URLSearchParams();
    if (effectiveStatus !== "active") params.set("status", effectiveStatus);
    activeFilterChips.push({
      key: "class",
      label: `Class: ${classNameById.get(classGroupId) ?? classGroupId}`,
      clearHref: `/pupils${params.toString() ? `?${params.toString()}` : ""}`,
    });
  }
  if (effectiveStatus !== "active") {
    const params = new URLSearchParams();
    if (classGroupId) params.set("classGroupId", classGroupId);
    activeFilterChips.push({
      key: "status",
      label: `Status: ${effectiveStatus === "all" ? "All" : "Archived"}`,
      clearHref: `/pupils${params.toString() ? `?${params.toString()}` : ""}`,
    });
  }

  return (
    <>
      <StaffNav />
      <main className="page page--wide">
        <div className="page-head">
          <div>
            <h1>Pupils</h1>
            <p>View, edit, and archive pupil roster records. Import new pupils via CSV.</p>
          </div>
          <Link href="/imports" className="btn btn--secondary">
            Import roster
          </Link>
        </div>

        <PupilFilters classes={classes} classGroupId={classGroupId} status={rawStatus ?? "active"} />

        {activeFilterChips.length > 0 ? (
          <ul className="chips" aria-label="Active filters" style={{ listStyle: "none" }}>
            {activeFilterChips.map((chip) => (
              <li key={chip.key}>
                <Link
                  href={chip.clearHref}
                  className="chip"
                  aria-current="true"
                  aria-label={`Remove filter: ${chip.label}`}
                >
                  {chip.label}
                  <span aria-hidden="true" style={{ marginLeft: "0.4rem" }}>
                    ✕
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}

        {pupils.length === 0 ? (
          <div className="card card--empty">
            <h2 style={{ marginBottom: "0.5rem" }}>No pupils match these filters</h2>
            <p className="muted">Try a different class or status, or import a roster.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <caption>
                {pupils.length} pupil{pupils.length === 1 ? "" : "s"}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Class</th>
                  <th scope="col">External ref</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {pupils.map((pupil) => (
                  <tr key={pupil.id}>
                    <td>
                      <Link href={`/pupils/${pupil.id}`}>
                        {pupil.firstName} {pupil.lastName}
                      </Link>
                    </td>
                    <td>{pupil.classGroupId ? classNameById.get(pupil.classGroupId) ?? "—" : "—"}</td>
                    <td>{pupil.externalRef ?? "—"}</td>
                    <td>
                      <StatusBadge status={pupil.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </>
  );
}
