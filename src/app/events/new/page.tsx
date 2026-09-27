import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { getStaffContext } from "@/server/http/session";
import { listClasses } from "@/server/services/dataService";
import { CreateEventForm } from "./CreateEventForm";
import { StaffNav } from "../../StaffNav";

export default async function NewEventPage() {
  const ctx = await getStaffContext();
  if (!ctx) redirect("/login");

  const classes = await listClasses(prisma, ctx);

  return (
    <>
      <StaffNav />
      <main className="page page--narrow">
        <Link href="/events" className="link-back">
          ← Back to events
        </Link>
        <h1>Create event</h1>
        <p>
          The event starts as a draft. Recipients are generated from each pupil&apos;s primary contact
          when you publish.
        </p>
        <div className="card" style={{ marginTop: "1.25rem" }}>
          <CreateEventForm classes={classes.map((c) => ({ id: c.id, name: c.name }))} />
        </div>
      </main>
    </>
  );
}
