"use client";

import { useActionState } from "react";
import { submitConsentAction, type ConsentFormState } from "./actions";

const initialState: ConsentFormState = {};

// Accessible consent form (ACCESSIBILITY_CHECKLIST.md): the granted/declined
// choice is a real radio group operable by keyboard, with visible focus and a
// fieldset/legend for grouping. Errors are announced via aria-live. Works
// without JavaScript via the Server Action form submission.
export function ConsentForm({ token }: { token: string }) {
  const action = submitConsentAction.bind(null, token);
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="form">
      <div role="alert" aria-live="polite">
        {state.error ? <p className="alert alert--error">{state.error}</p> : null}
      </div>

      <fieldset className="fieldset">
        <legend>Do you give consent?</legend>
        <div className="stack" style={{ gap: "0.6rem", marginTop: "0.75rem" }}>
          <label className="radio-option">
            <input type="radio" name="response" value="granted" required />
            Yes, I give consent
          </label>
          <label className="radio-option">
            <input type="radio" name="response" value="declined" required />
            No, I decline consent
          </label>
        </div>
      </fieldset>

      <div className="field">
        <label htmlFor="notes">Notes (optional)</label>
        <textarea id="notes" name="notes" rows={3} className="textarea" />
      </div>

      <button type="submit" disabled={pending} className="btn btn--primary btn--block">
        {pending ? "Submitting…" : "Submit response"}
      </button>
    </form>
  );
}
