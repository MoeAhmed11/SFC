import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { getStaffContext } from "@/server/http/session";
import { getAuditActionOptions, getAuditLog } from "@/server/services/auditService";
import { listStaff } from "@/server/services/staffAdminService";
import { ForbiddenError } from "@/server/errors";
import { StaffNav } from "../StaffNav";

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

interface PageProps {
  searchParams: Promise<{
    actorId?: string;
    action?: string;
    entityType?: string;
    entityId?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
}

const PAGE_SIZE = 50;

export default async function AuditLogPage({ searchParams }: PageProps) {
  const ctx = await getStaffContext();
  if (!ctx) redirect("/login");

  const params = await searchParams;
  const page = Number(params.page ?? "1") || 1;

  const filter = {
    actorId: params.actorId || undefined,
    action: params.action || undefined,
    entityType: params.entityType || undefined,
    entityId: params.entityId || undefined,
    from: params.from ? new Date(params.from) : undefined,
    to: params.to ? new Date(params.to) : undefined,
  };

  let result;
  let staff;
  let actionOptions: string[];
  try {
    [result, staff, actionOptions] = await Promise.all([
      getAuditLog(prisma, ctx, filter, { page, pageSize: PAGE_SIZE }),
      listStaff(prisma, ctx),
      getAuditActionOptions(prisma, ctx),
    ]);
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return (
        <>
          <StaffNav />
          <main className="page">
            <div className="card" style={{ textAlign: "center", padding: "3rem 1.5rem" }}>
              <h1>Audit log</h1>
              <p className="muted">Only admins can view the audit log.</p>
            </div>
          </main>
        </>
      );
    }
    throw err;
  }

  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));

  function pageHref(targetPage: number) {
    const qp = new URLSearchParams();
    if (filter.actorId) qp.set("actorId", filter.actorId);
    if (filter.action) qp.set("action", filter.action);
    if (filter.entityType) qp.set("entityType", filter.entityType);
    if (filter.entityId) qp.set("entityId", filter.entityId);
    if (params.from) qp.set("from", params.from);
    if (params.to) qp.set("to", params.to);
    qp.set("page", String(targetPage));
    return `/audit?${qp.toString()}`;
  }

  return (
    <>
      <StaffNav />
      <main className="page page--wide">
        <div className="page-head">
          <div>
            <h1>Audit log</h1>
            <p>A record of important actions taken in your school&apos;s account.</p>
          </div>
        </div>

        <form className="toolbar" style={{ marginBottom: "1rem", flexWrap: "wrap", alignItems: "flex-end" }} method="get">
          <div className="field">
            <label htmlFor="actorId">Actor</label>
            <select id="actorId" name="actorId" className="select" defaultValue={filter.actorId ?? ""}>
              <option value="">All actors</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="action">Action</label>
            <select id="action" name="action" className="select" defaultValue={filter.action ?? ""}>
              <option value="">All actions</option>
              {actionOptions.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="entityType">Entity type</label>
            <input
              id="entityType"
              name="entityType"
              type="text"
              className="input"
              defaultValue={filter.entityType ?? ""}
              placeholder="e.g. Pupil"
            />
          </div>
          <div className="field">
            <label htmlFor="entityId">Entity ID</label>
            <input
              id="entityId"
              name="entityId"
              type="text"
              className="input"
              defaultValue={filter.entityId ?? ""}
            />
          </div>
          <div className="field">
            <label htmlFor="from">From</label>
            <input id="from" name="from" type="date" className="input" defaultValue={params.from ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="to">To</label>
            <input id="to" name="to" type="date" className="input" defaultValue={params.to ?? ""} />
          </div>
          <button type="submit" className="btn btn--secondary btn--sm">
            Apply filters
          </button>
          <Link href="/audit" className="btn btn--ghost btn--sm">
            Clear
          </Link>
        </form>

        {result.rows.length === 0 ? (
          <div className="card">
            <p className="muted" style={{ margin: 0 }}>
              No audit entries match these filters.
            </p>
          </div>
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <caption>
                  {result.total} entr{result.total === 1 ? "y" : "ies"} (page {result.page} of {totalPages})
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Timestamp</th>
                    <th scope="col">Actor</th>
                    <th scope="col">Action</th>
                    <th scope="col">Entity</th>
                    <th scope="col">Metadata</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((entry) => (
                    <tr key={entry.id}>
                      <td>{formatDate(entry.createdAt)}</td>
                      <td>
                        {entry.actorName ?? entry.actorType}
                        {entry.actorName ? <span className="hint"> ({entry.actorType})</span> : null}
                      </td>
                      <td>
                        <code>{entry.action}</code>
                      </td>
                      <td>
                        {entry.entityType ? (
                          <>
                            {entry.entityType}
                            {entry.entityId ? <span className="hint"> #{entry.entityId}</span> : null}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        <code style={{ fontSize: "0.8rem" }}>{entry.metadata}</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 ? (
              <nav aria-label="Audit log pagination" className="toolbar" style={{ marginTop: "1rem" }}>
                {page > 1 ? (
                  <Link href={pageHref(page - 1)} className="btn btn--secondary btn--sm">
                    ← Previous
                  </Link>
                ) : null}
                <span className="hint">
                  Page {page} of {totalPages}
                </span>
                {page < totalPages ? (
                  <Link href={pageHref(page + 1)} className="btn btn--secondary btn--sm">
                    Next →
                  </Link>
                ) : null}
              </nav>
            ) : null}
          </>
        )}
      </main>
    </>
  );
}
