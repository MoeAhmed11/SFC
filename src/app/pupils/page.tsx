import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { getStaffContext } from "@/server/http/session";
import { listPupils, listClasses } from "@/server/services/dataService";
import { isPupilStatus, type PupilStatus } from "@/server/domain";
import { StaffNav } from "../StaffNav";
import { StatusBadge } from "../StatusBadge";

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

        <form className="toolbar" style={{ marginBottom: "1rem", alignItems: "flex-end" }} method="get">
          <div className="field">
            <label htmlFor="classGroupId">Class</label>
            <select id="classGroupId" name="classGroupId" className="select" defaultValue={classGroupId ?? ""}>
              <option value="">All classes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="status">Status</label>
            <select id="status" name="status" className="select" defaultValue={rawStatus ?? "active"}>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
              <option value="all">All</option>
            </select>
          </div>
          <button type="submit" className="btn btn--secondary btn--sm">
            Apply filters
          </button>
        </form>

        {pupils.length === 0 ? (
          <div className="card" style={{ textAlign: "center", padding: "3rem 1.5rem" }}>
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
