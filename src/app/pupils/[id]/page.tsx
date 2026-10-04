import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { getStaffContext } from "@/server/http/session";
import {
  getPupil,
  getPupilConsentHistory,
  getPupilEventRecipients,
  getPupilGuardians,
  listClasses,
} from "@/server/services/dataService";
import { getSchoolSettings } from "@/server/services/schoolSettingsService";
import { NotFoundError } from "@/server/errors";
import { GuardianActions } from "./GuardianActions";
import { PupilActions } from "./PupilActions";
import { ResendConsentButton } from "./ResendConsentButton";
import { RecordOfflineConsentForm } from "./RecordOfflineConsentForm";
import { StaffNav } from "../../StaffNav";
import { StatusBadge } from "../../StatusBadge";

interface PageProps {
  params: Promise<{ id: string }>;
}

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

export default async function PupilDetailPage({ params }: PageProps) {
  const ctx = await getStaffContext();
  if (!ctx) redirect("/login");

  const { id } = await params;

  let pupil;
  try {
    pupil = await getPupil(prisma, ctx, id);
  } catch (err) {
    if (err instanceof NotFoundError) {
      return (
        <>
          <StaffNav />
          <main className="page">
            <div className="card" style={{ textAlign: "center", padding: "3rem 1.5rem" }}>
              <h1>Pupil not found</h1>
              <p className="muted">This pupil may have been removed.</p>
              <Link href="/pupils" className="btn btn--secondary" style={{ marginTop: "1rem" }}>
                Back to pupils
              </Link>
            </div>
          </main>
        </>
      );
    }
    throw err;
  }

  const [classes, consentHistory, recipientPairings, guardianLinks, settings] = await Promise.all([
    listClasses(prisma, ctx),
    getPupilConsentHistory(prisma, ctx, id),
    getPupilEventRecipients(prisma, ctx, id),
    getPupilGuardians(prisma, ctx, id),
    getSchoolSettings(prisma, ctx),
  ]);

  return (
    <>
      <StaffNav />
      <main className="page">
        <Link href="/pupils" className="link-back">
          ← Back to pupils
        </Link>

        <div className="page-head">
          <div>
            <h1 style={{ marginBottom: "0.5rem" }}>
              {pupil.firstName} {pupil.lastName}
            </h1>
            <StatusBadge status={pupil.status} />
          </div>
        </div>

        <section className="card">
          <dl className="detail-list">
            <dt>External ref</dt>
            <dd>{pupil.externalRef ?? "—"}</dd>
          </dl>
          <p className="hint" style={{ marginTop: "-0.5rem" }}>
            External ref is set at import time and cannot be edited here.
          </p>

          <PupilActions
            pupilId={pupil.id}
            firstName={pupil.firstName}
            lastName={pupil.lastName}
            classGroupId={pupil.classGroupId}
            status={pupil.status}
            classes={classes.map((c) => ({ id: c.id, name: c.name }))}
          />
        </section>

        <h2 style={{ marginTop: "2rem" }}>Guardians</h2>
        <p className="muted">
          Edit a linked guardian&apos;s contact details, or change who is the authorised primary
          contact for this pupil. Only the primary contact receives consent requests and reminders.
        </p>

        {guardianLinks.length === 0 ? (
          <div className="card">
            <p className="muted" style={{ margin: 0 }}>
              No guardians are linked to this pupil yet.
            </p>
          </div>
        ) : (
          <div className="stack" style={{ gap: "1.25rem" }}>
            {guardianLinks.map((link) => (
              <section key={link.guardianId} className="card">
                <h3 className="card__title">{link.guardian.name}</h3>
                <GuardianActions
                  pupilId={pupil.id}
                  guardianId={link.guardian.id}
                  name={link.guardian.name}
                  email={link.guardian.email}
                  relationship={link.relationship}
                  isAuthorised={link.isAuthorised}
                  isPrimaryContact={link.isPrimaryContact}
                />
              </section>
            ))}
          </div>
        )}

        <h2 style={{ marginTop: "2rem" }}>Consent requests</h2>
        <p className="muted">
          Resend a consent link if a guardian says they didn&apos;t receive it, or if they want to change
          their response. This works even after the consent deadline has passed, as long as the event
          hasn&apos;t started yet.
        </p>

        {recipientPairings.length === 0 ? (
          <div className="card">
            <p className="muted" style={{ margin: 0 }}>
              This pupil isn&apos;t registered for any events yet.
            </p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <caption>
                {recipientPairings.length} event registration{recipientPairings.length === 1 ? "" : "s"}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Event</th>
                  <th scope="col">Starts</th>
                  <th scope="col">Guardian</th>
                  <th scope="col">Event status</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {recipientPairings.map((pairing) => {
                  const disabled =
                    pairing.event.status === "cancelled" ||
                    pairing.event.status === "completed" ||
                    pairing.event.startsAt.getTime() <= Date.now();
                  return (
                    <tr key={pairing.id}>
                      <td>{pairing.event.title}</td>
                      <td>{formatDate(pairing.event.startsAt)}</td>
                      <td>
                        {pairing.guardian.name}
                        <br />
                        <span className="hint">{pairing.guardian.email}</span>
                      </td>
                      <td>
                        <StatusBadge status={pairing.event.status} />
                      </td>
                      <td>
                        <div className="stack" style={{ gap: "0.5rem" }}>
                          <ResendConsentButton
                            pupilId={pupil.id}
                            eventId={pairing.event.id}
                            guardianId={pairing.guardian.id}
                            disabled={disabled}
                          />
                          {settings.allowOfflineConsent ? (
                            <RecordOfflineConsentForm
                              pupilId={pupil.id}
                              eventId={pairing.event.id}
                              guardianId={pairing.guardian.id}
                              disabled={disabled}
                            />
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <h2 style={{ marginTop: "2rem" }}>Consent history</h2>
        <p className="muted">
          Every response given for this pupil, across all events — including responses that were later
          changed. Superseded responses are kept for the audit trail.
        </p>

        {consentHistory.length === 0 ? (
          <div className="card">
            <p className="muted" style={{ margin: 0 }}>
              No consent responses recorded yet for this pupil.
            </p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <caption>
                {consentHistory.length} response{consentHistory.length === 1 ? "" : "s"}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Event</th>
                  <th scope="col">Guardian</th>
                  <th scope="col">Response</th>
                  <th scope="col">State</th>
                  <th scope="col">Submitted</th>
                  <th scope="col">Source</th>
                  <th scope="col">Notes</th>
                </tr>
              </thead>
              <tbody>
                {consentHistory.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.event.title}</td>
                    <td>{entry.guardian.name}</td>
                    <td>
                      <StatusBadge status={entry.response} />
                    </td>
                    <td>
                      <StatusBadge status={entry.state} />
                    </td>
                    <td>{formatDate(entry.submittedAt)}</td>
                    <td>{entry.source === "staff" ? "Recorded by staff" : "Submitted by parent"}</td>
                    <td>{entry.notes ?? "—"}</td>
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
