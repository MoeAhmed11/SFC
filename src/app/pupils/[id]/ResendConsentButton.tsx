"use client";

import { useActionState } from "react";
import { resendConsentLinkAction, type PupilActionState } from "./actions";

const initial: PupilActionState = {};

// Resend/reissue a consent link for one event+guardian pairing (Requirement 3
// of the MVP admin & consent enhancements spec). Available to admin and
// organiser. Works regardless of the consent deadline — the server rejects it
// once the event has started or been cancelled/completed, and surfaces that
// as the error message here.
export function ResendConsentButton({
  pupilId,
  eventId,
  guardianId,
  disabled,
}: {
  pupilId: string;
  eventId: string;
  guardianId: string;
  disabled?: boolean;
}) {
  const bound = resendConsentLinkAction.bind(null, pupilId, eventId, guardianId);
  const [state, formAction, pending] = useActionState(bound, initial);

  return (
    <div className="stack" style={{ gap: "0.35rem" }}>
      <form action={formAction}>
        <button type="submit" disabled={pending || disabled} className="btn btn--secondary btn--sm">
          {pending ? "Sending…" : "Resend link"}
        </button>
      </form>
      {state.error ? (
        <p role="alert" className="alert alert--error" style={{ margin: 0, fontSize: "0.85rem" }}>
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p role="status" className="alert alert--success" style={{ margin: 0, fontSize: "0.85rem" }}>
          {state.success}
        </p>
      ) : null}
    </div>
  );
}
