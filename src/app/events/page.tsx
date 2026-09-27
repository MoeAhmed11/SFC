import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { getStaffContext } from "@/server/http/session";
import { listEvents } from "@/server/services/eventService";
import { StaffNav } from "../StaffNav";
import { StatusBadge } from "../StatusBadge";

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

export default async function EventsListPage() {
  const ctx = await getStaffContext();
  if (!ctx) redirect("/login");

  const events = await listEvents(prisma, ctx);

  return (
    <>
      <StaffNav />
      <main className="page page--wide">
        <div className="page-head">
          <div>
            <h1>Events</h1>
            <p>Create activities, publish them, and track consent as replies come in.</p>
          </div>
          <Link href="/events/new" className="btn btn--primary">
            Create event
          </Link>
        </div>

        {events.length === 0 ? (
          <div className="card" style={{ textAlign: "center", padding: "3rem 1.5rem" }}>
            <h2 style={{ marginBottom: "0.5rem" }}>No events yet</h2>
            <p className="muted">Create your first event to start collecting consent.</p>
            <Link href="/events/new" className="btn btn--primary" style={{ marginTop: "1rem" }}>
              Create event
            </Link>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <caption>
                {events.length} event{events.length === 1 ? "" : "s"}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Title</th>
                  <th scope="col">Status</th>
                  <th scope="col">Starts</th>
                  <th scope="col">Consent deadline</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id}>
                    <td>
                      <Link href={`/events/${event.id}`}>{event.title}</Link>
                    </td>
                    <td>
                      <StatusBadge status={event.status} />
                    </td>
                    <td>{formatDate(event.startsAt)}</td>
                    <td>{formatDate(event.consentDeadline)}</td>
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
