import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { getPlatformContext } from "@/server/http/platformSession";
import { listSchoolsWithUsage } from "@/server/services/platformAdminService";
import { PlatformNav } from "./PlatformNav";
import { CreateSchoolForm } from "./CreateSchoolForm";

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(d);
}

export default async function PlatformDashboardPage() {
  const ctx = await getPlatformContext();
  if (!ctx) redirect("/platform/login");

  const rows = await listSchoolsWithUsage(prisma, ctx);

  return (
    <>
      <PlatformNav />
      <main className="page page--wide">
        <div className="page-head">
          <div>
            <h1>Schools</h1>
            <p>Every school on the platform, with read-only usage counts.</p>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="card">
            <p className="muted" style={{ margin: 0 }}>
              No schools yet. Create the first one below.
            </p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <caption>
                {rows.length} school{rows.length === 1 ? "" : "s"}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Type</th>
                  <th scope="col">Created</th>
                  <th scope="col">Staff</th>
                  <th scope="col">Pupils</th>
                  <th scope="col">Guardians</th>
                  <th scope="col">Events</th>
                  <th scope="col">Published</th>
                  <th scope="col">Consent responses</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ school, usage }) => (
                  <tr key={school.id}>
                    <td>{school.name}</td>
                    <td>{school.schoolType}</td>
                    <td>{formatDate(school.createdAt)}</td>
                    <td>{usage.staffCount}</td>
                    <td>{usage.pupilCount}</td>
                    <td>{usage.guardianCount}</td>
                    <td>{usage.eventCount}</td>
                    <td>{usage.publishedEventCount}</td>
                    <td>{usage.consentResponseCount}</td>
                    <td>
                      <Link href={`/platform/schools/${school.id}`} className="btn btn--secondary btn--sm">
                        Manage
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="card" style={{ marginTop: "2rem", maxWidth: 560 }}>
          <h2 className="card__title">Create a new school</h2>
          <p className="muted">
            Creates the school and activates its first admin immediately — no invite-acceptance step.
          </p>
          <CreateSchoolForm />
        </div>
      </main>
    </>
  );
}
