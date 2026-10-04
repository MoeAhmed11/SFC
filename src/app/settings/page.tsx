import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { getStaffContext } from "@/server/http/session";
import { getSchoolSettings } from "@/server/services/schoolSettingsService";
import { SettingsForm } from "./SettingsForm";
import { StaffNav } from "../StaffNav";

// School policy settings (decisions 17.3-17.5, 17.9): whether parents can
// edit a submitted consent response, whether late consent is accepted,
// whether offline/paper consent can be recorded, and data retention length.
// getSchoolSettings itself has no capability gate (any signed-in staff member
// could read it), but these are admin-only policy decisions, so the page is
// gated to the admin role here, mirroring the "only administrators can..."
// pattern used in src/app/staff/page.tsx.
export default async function SettingsPage() {
  const ctx = await getStaffContext();
  if (!ctx) redirect("/login");

  if (ctx.role !== "admin") {
    return (
      <>
        <StaffNav />
        <main className="page">
          <h1>Settings</h1>
          <div className="card">
            <p style={{ margin: 0 }}>Only administrators can manage school settings.</p>
          </div>
        </main>
      </>
    );
  }

  const settings = await getSchoolSettings(prisma, ctx);

  return (
    <>
      <StaffNav />
      <main className="page">
        <div className="page-head">
          <div>
            <h1>Settings</h1>
            <p>Control how consent works for your school.</p>
          </div>
        </div>

        <div className="card" style={{ maxWidth: 520 }}>
          <h2 className="card__title">Consent policy</h2>
          <SettingsForm settings={settings} />
        </div>
      </main>
    </>
  );
}
