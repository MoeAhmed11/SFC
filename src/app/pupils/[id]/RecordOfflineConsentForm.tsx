"use client";

import { useActionState, useState } from "react";
import { recordOfflineConsentAction, type PupilActionState } from "./actions";

const initial: PupilActionState = {};

// Lets staff record a parent's consent decision given offline (paper form,
// phone call, in person) — decision 17.5. Only rendered by the pupil page
// when the school's allowOfflineConsent setting is on; recordOfflineConsent
// also enforces that server-side, so this is UX convenience, not the real
// gate. Collapsed behind a toggle button by default so it doesn't compete
// visually with "Resend link" for the common case.
export function RecordOfflineConsentForm({
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
  const [open, setOpen] = useState(false);
  const bound = recordOfflineConsentAction.bind(null, pupilId, eventId, guardianId);
  const [state, formAction, pending] = useActionState(bound, initial);

  if (!open) {
    return (
      <button
        type="button"
        disabled={disabled}
        className="btn btn--ghost btn--sm"
        onClick={() => setOpen(true)}
      >
        Record offline consent
      </button>
    );
  }

  return (
    <form action={formAction} className="form" style={{ gap: "0.6rem", minWidth: "14rem" }}>
      <div role="alert" aria-live="polite">
        {state.error ? (
          <p className="alert alert--error" style={{ margin: 0, fontSize: "0.85rem" }}>
            {state.error}
          </p>
        ) : null}
        {state.success ? (
          <p className="alert alert--success" style={{ margin: 0, fontSize: "0.85rem" }}>
            {state.success}
          </p>
        ) : null}
      </div>

      <fieldset className="fieldset" style={{ padding: "0.6rem" }}>
        <legend style={{ fontSize: "0.85rem" }}>Parent&apos;s decision</legend>
        <div className="stack" style={{ gap: "0.4rem", marginTop: "0.5rem" }}>
          <label className="radio-option">
            <input type="radio" name="response" value="granted" required />
            Granted
          </label>
          <label className="radio-option">
            <input type="radio" name="response" value="declined" required />
            Declined
          </label>
        </div>
      </fieldset>

      <div className="field">
        <label htmlFor={`offline-notes-${eventId}-${guardianId}`}>How was this given? (optional)</label>
        <textarea
          id={`offline-notes-${eventId}-${guardianId}`}
          name="notes"
          rows={2}
          className="textarea"
          placeholder="e.g. Signed paper form returned 14 Oct, or phone call with parent"
        />
      </div>

      <div className="toolbar">
        <button type="submit" disabled={pending} className="btn btn--secondary btn--sm">
          {pending ? "Saving…" : "Save"}
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
