import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { getStaffContext } from "@/server/http/session";
import { ForbiddenError } from "@/server/errors";
import { listStaff } from "@/server/services/staffAdminService";
import { InviteStaffForm } from "./InviteStaffForm";
import { StaffRow } from "./StaffRow";
import { StaffNav } from "../StaffNav";

export default async function StaffPage() {
  const ctx = await getStaffContext();
  if (!ctx) redirect("/login");

  let staff;
  try {
    staff = await listStaff(prisma, ctx);
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return (
        <>
          <StaffNav />
          <main className="page">
            <h1>Staff</h1>
            <div className="card">
              <p style={{ margin: 0 }}>Only administrators can manage staff.</p>
            </div>
          </main>
        </>
      );
    }
    throw err;
  }

  const hasInvited = staff.some((s) => s.status === "invited");

  return (
    <>
      <StaffNav />
      <main className="page">
        <div className="page-head">
          <div>
            <h1>Staff</h1>
            <p>Invite colleagues and manage who can create events and manage consent.</p>
          </div>
        </div>

        {hasInvited ? (
          <p role="note" className="alert alert--info" style={{ marginBottom: "1.25rem" }}>
            Invited staff activate their account through the invite link you share with them. Until then
            they can&apos;t sign in.
          </p>
        ) : null}

        <div className="table-wrap">
          <table className="table">
            <caption>
              {staff.length} staff member{staff.length === 1 ? "" : "s"}
            </caption>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Email</th>
                <th scope="col">Role</th>
                <th scope="col">Status</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => (
                <StaffRow
                  key={s.id}
                  id={s.id}
                  name={s.name}
                  email={s.email}
                  role={s.role}
                  status={s.status}
                  isSelf={s.id === ctx.staffUserId}
                />
              ))}
            </tbody>
          </table>
        </div>

        <div className="card" style={{ marginTop: "2rem", maxWidth: 520 }}>
          <h2 className="card__title">Invite staff</h2>
          <InviteStaffForm />
        </div>
      </main>
    </>
  );
}
