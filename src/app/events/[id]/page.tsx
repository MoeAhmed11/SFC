import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { getStaffContext } from "@/server/http/session";
import { getEvent } from "@/server/services/eventService";
import { getEventDashboard, getEventResponses, RESPONSE_FILTERS, type ResponseFilter } from "@/server/services/dashboardService";
import { listClasses } from "@/server/services/dataService";
import { NotFoundError } from "@/server/errors";
import { EventActions } from "./EventActions";
import { StaffNav } from "../../StaffNav";
import { StatusBadge } from "../../StatusBadge";

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ filter?: string }>;
}

export default async function EventDetailPage({ params, searchParams }: PageProps) {
  const ctx = await getStaffContext();
  if (!ctx) redirect("/login");

  const { id } = await params;
  const { filter: rawFilter } = await searchParams;
  const filter: ResponseFilter = (RESPONSE_FILTERS as readonly string[]).includes(rawFilter ?? "")
    ? (rawFilter as ResponseFilter)
    : "all";

  let event;
  try {
    event = await getEvent(prisma, ctx, id);
  } catch (err) {
    if (err instanceof NotFoundError) {
      return (
        <>
          <StaffNav />
          <main className="page">
            <div className="card" style={{ textAlign: "center", padding: "3rem 1.5rem" }}>
              <h1>Event not found</h1>
              <p className="muted">This event may have been removed.</p>
              <Link href="/events" className="btn btn--secondary" style={{ marginTop: "1rem" }}>
                Back to events
              </Link>
            </div>
          </main>
        </>
      );
    }
    throw err;
  }

  const [dashboard, responses, classes] = await Promise.all([
    getEventDashboard(prisma, ctx, id),
    getEventResponses(prisma, ctx, id, filter),
    listClasses(prisma, ctx),
  ]);

  return (
    <>
      <StaffNav />
      <main className="page">
        <Link href="/events" className="link-back">
          ← Back to events
        </Link>

        <div className="page-head">
          <div>
            <h1 style={{ marginBottom: "0.5rem" }}>{event.title}</h1>
            <StatusBadge status={event.status} />
          </div>
          <a href={`/api/events/${id}/export`} className="btn btn--secondary btn--sm">
            Export register (CSV)
          </a>
        </div>

        <section className="card">
          <dl className="detail-list">
            <dt>Starts</dt>
            <dd>{formatDate(event.startsAt)}</dd>
            <dt>Ends</dt>
            <dd>{formatDate(event.endsAt)}</dd>
            <dt>Consent deadline</dt>
            <dd>{formatDate(event.consentDeadline)}</dd>
            {event.location ? (
              <>
                <dt>Location</dt>
                <dd>{event.location}</dd>
              </>
            ) : null}
          </dl>

          <EventActions
            eventId={id}
            status={event.status}
            classes={classes.map((c) => ({ id: c.id, name: c.name }))}
          />
        </section>

        <h2 style={{ marginTop: "2rem" }}>Consent status</h2>
        <ul className="stats">
          <li className="stat">
            <div className="stat__value">{dashboard.totals.invited}</div>
            <div className="stat__label">Invited</div>
          </li>
          <li className="stat stat--good">
            <div className="stat__value">{dashboard.totals.consented}</div>
            <div className="stat__label">Consented</div>
          </li>
          <li className="stat stat--bad">
            <div className="stat__value">{dashboard.totals.declined}</div>
            <div className="stat__label">Declined</div>
          </li>
          <li className="stat stat--warn">
            <div className="stat__value">{dashboard.totals.outstanding}</div>
            <div className="stat__label">Outstanding</div>
          </li>
        </ul>

        <h2 style={{ marginTop: "2rem" }}>Responses</h2>
        <nav aria-label="Filter responses" className="chips">
          {RESPONSE_FILTERS.map((f) => (
            <Link
              key={f}
              href={`/events/${id}?filter=${f}`}
              className="chip"
              aria-current={filter === f ? "true" : undefined}
            >
              {f}
            </Link>
          ))}
        </nav>

        {responses.length === 0 ? (
          <div className="card">
            <p className="muted" style={{ margin: 0 }}>
              No responses match this filter.
            </p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <caption>
                {responses.length} recipient{responses.length === 1 ? "" : "s"} ({filter})
              </caption>
              <thead>
                <tr>
                  <th scope="col">Pupil</th>
                  <th scope="col">Class</th>
                  <th scope="col">Guardian</th>
                  <th scope="col">Status</th>
                  <th scope="col">Responded</th>
                </tr>
              </thead>
              <tbody>
                {responses.map((r, idx) => (
                  <tr key={idx}>
                    <td>{r.pupilName}</td>
                    <td>{r.className ?? "—"}</td>
                    <td>{r.guardianName}</td>
                    <td>
                      <StatusBadge status={r.status} />
                    </td>
                    <td>{r.respondedAt ? formatDate(r.respondedAt) : "—"}</td>
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
