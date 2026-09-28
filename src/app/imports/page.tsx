import { redirect } from "next/navigation";
import { getStaffContext } from "@/server/http/session";
import { importTemplateCsv } from "@/server/csv/template";
import { ImportForm } from "./ImportForm";
import { StaffNav } from "../StaffNav";

export default async function ImportsPage() {
  const ctx = await getStaffContext();
  if (!ctx) redirect("/login");

  const template = importTemplateCsv();

  return (
    <>
      <StaffNav />
      <main className="page">
        <div className="page-head">
          <div>
            <h1>Import roster</h1>
            <p>
              Import classes, pupils, and their primary-contact guardian from a CSV file. Nothing is
              written until you check for errors and confirm.
            </p>
          </div>
          <a
            href={`data:text/csv;charset=utf-8,${encodeURIComponent(template)}`}
            download="consapass-import-template.csv"
            className="btn btn--secondary btn--sm"
          >
            Download template
          </a>
        </div>

        <div className="card">
          <ImportForm />
        </div>
      </main>
    </>
  );
}
