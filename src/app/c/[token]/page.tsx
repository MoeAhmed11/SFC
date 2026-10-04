import { prisma } from "@/server/db";
import { getConsentView } from "@/server/services/consentService";
import { AppError } from "@/server/errors";
import { ConsentForm } from "./ConsentForm";

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "full", timeStyle: "short" }).format(d);
}

interface PageProps {
  params: Promise<{ token: string }>;
}

// The parent's entire experience: no account, a single opaque token in the
// URL, resolved server-side. Every failure mode (unknown / expired / revoked /
// already-used-for-another-purpose token) renders the SAME safe message —
// never a distinguishing error — per FR-04.
export default async function ConsentPage({ params }: PageProps) {
  const { token } = await params;

  let view;
  try {
    view = await getConsentView(prisma, token);
  } catch (err) {
    if (err instanceof AppError) {
      return <InvalidLink />;
    }
    throw err;
  }

  const { event, pupilName, currentResponse, canRespond } = view;

  return (
    <main className="auth-screen">
      <div className="auth-card">
        <div className="brandmark">
          <span className="brandmark__logo">CP</span>
          ConsaPass
        </div>

        <h1 style={{ marginTop: "1.5rem" }}>{event.title}</h1>
        <p style={{ marginTop: 0 }}>
          Consent request for <strong>{pupilName}</strong>.
        </p>

        <dl className="detail-list" style={{ margin: "1.25rem 0" }}>
          <dt>When</dt>
          <dd>{formatDate(event.startsAt)}</dd>
          {event.location ? (
            <>
              <dt>Where</dt>
              <dd>{event.location}</dd>
            </>
          ) : null}
          <dt>Respond by</dt>
          <dd>{formatDate(event.consentDeadline)}</dd>
        </dl>

        {event.description ? <p>{event.description}</p> : null}

        {event.status === "cancelled" ? (
          <p role="alert" className="alert alert--warning">
            This activity has been cancelled. No response is needed.
          </p>
        ) : currentResponse && !canRespond ? (
          <AlreadyResponded response={currentResponse} />
        ) : !currentResponse && !canRespond && view.deadlinePassed ? (
          <p role="alert" className="alert alert--warning">
            The deadline to respond to this activity has passed.
          </p>
        ) : (
          <>
            {currentResponse ? (
              <p role="status" className="alert alert--info">
                You previously {currentResponse === "granted" ? "gave" : "declined"} consent for this
                activity. Submitting below will replace that response.
              </p>
            ) : null}
            <ConsentForm token={token} currentResponse={currentResponse} />
          </>
        )}
      </div>
    </main>
  );
}

function AlreadyResponded({ response }: { response: "granted" | "declined" }) {
  return (
    <div role="status" className="alert alert--success">
      <p style={{ marginTop: 0 }}>
        Thank you — you have already {response === "granted" ? "given consent" : "declined consent"} for
        this activity.
      </p>
      <p style={{ marginBottom: 0 }}>
        If you need to change your response, please contact the school directly.
      </p>
    </div>
  );
}

// Safe, generic state for any invalid/expired/revoked/unknown token. No
// self-service reissue exists yet (reissue is currently a staff-initiated
// action) — the parent is directed to contact the school instead of being
// shown a distinguishing error.
function InvalidLink() {
  return (
    <main className="auth-screen">
      <div className="auth-card">
        <div className="brandmark">
          <span className="brandmark__logo">CP</span>
          ConsaPass
        </div>
        <h1 style={{ marginTop: "1.5rem" }}>This link is no longer valid</h1>
        <p>
          This link may have expired, been used already, or been revoked. Please contact your school
          office, who can send you a new link.
        </p>
      </div>
    </main>
  );
}
