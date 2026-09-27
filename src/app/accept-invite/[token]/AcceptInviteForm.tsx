"use client";

import { useActionState } from "react";
import { acceptInviteAction, type AcceptInviteFormState } from "./actions";

const initialState: AcceptInviteFormState = {};

// Accessible password-setting form (ACCESSIBILITY_CHECKLIST.md): real labels,
// aria-live error region, works without JS via the Server Action.
export function AcceptInviteForm({ token }: { token: string }) {
  const action = acceptInviteAction.bind(null, token);
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="form" style={{ marginTop: "1.5rem" }}>
      <div role="alert" aria-live="polite">
        {state.error ? <p className="alert alert--error">{state.error}</p> : null}
      </div>

      <div className="field">
        <label htmlFor="password">Choose a password</label>
        <span className="hint">At least 12 characters.</span>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={12}
          required
          className="input"
        />
      </div>
      <div className="field">
        <label htmlFor="confirmPassword">Confirm password</label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={12}
          required
          className="input"
        />
      </div>

      <button type="submit" disabled={pending} className="btn btn--primary btn--block">
        {pending ? "Setting up…" : "Set password and sign in"}
      </button>
    </form>
  );
}
