import { notFound, redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { getPlatformContext } from "@/server/http/platformSession";
import { getSchoolWithUsage } from "@/server/services/platformAdminService";
import { PlatformNav } from "../../PlatformNav";
import { AddAdminForm } from "./AddAdminForm";

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

export default async function PlatformSchoolDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getPlatformContext();
  if (!ctx) redirect("/platform/login");

  const { id } = await params;
  const row = await getSchoolWithUsage(prisma, ctx, id);
  if (!row) notFound();

  const { school, usage } = row;

  return (
    <>
      <PlatformNav />
      <main className="page">
        <div className="page-head">
          <div>
            <h1>{school.name}</h1>
            <p>
              {school.schoolType} · created {formatDate(school.createdAt)}
            </p>
          </div>
        </div>

        <div className="card">
          <h2 className="card__title">Usage</h2>
          <ul className="stats">
            <li className="stat">
              <div className="stat__value">{usage.staffCount}</div>
              <div className="stat__label">Staff</div>
            </li>
            <li className="stat">
              <div className="stat__value">{usage.pupilCount}</div>
              <div className="stat__label">Pupils</div>
            </li>
            <li className="stat">
              <div className="stat__value">{usage.guardianCount}</div>
              <div className="stat__label">Guardians</div>
            </li>
            <li className="stat">
              <div className="stat__value">{usage.eventCount}</div>
              <div className="stat__label">Events</div>
            </li>
            <li className="stat">
              <div className="stat__value">{usage.publishedEventCount}</div>
              <div className="stat__label">Published events</div>
            </li>
            <li className="stat">
              <div className="stat__value">{usage.consentResponseCount}</div>
              <div className="stat__label">Consent responses</div>
            </li>
          </ul>
        </div>

        <div className="card" style={{ marginTop: "1.5rem", maxWidth: 520 }}>
          <h2 className="card__title">Add an admin</h2>
          <p className="muted">
            Creates and activates a new admin for this school immediately — useful if the school has
            lost access to all its admin accounts.
          </p>
          <AddAdminForm schoolId={school.id} />
        </div>
      </main>
    </>
  );
}
