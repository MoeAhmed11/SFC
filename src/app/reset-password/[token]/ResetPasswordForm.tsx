"use client";

import { useActionState } from "react";
import { resetPasswordAction, type ResetPasswordFormState } from "./actions";

const initialState: ResetPasswordFormState = {};

// Accessible password-reset form (ACCESSIBILITY_CHECKLIST.md conventions):
// real labels, aria-live error region, works without client JS via the
// Server Action. Mirrors AcceptInviteForm.tsx's structure closely — this is
// the same "set a password via a single-use token" pattern, just for an
// existing account instead of a new one.
export function ResetPasswordForm({ token }: { token: string }) {
  const action = resetPasswordAction.bind(null, token);
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="form" style={{ marginTop: "1.5rem" }}>
      <div role="alert" aria-live="polite">
        {state.error ? <p className="alert alert--error">{state.error}</p> : null}
      </div>

      <div className="field">
        <label htmlFor="password">New password</label>
        <span className="hint">At least 12 characters, with an uppercase letter, a lowercase letter, a digit, and a symbol.</span>
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
        <label htmlFor="confirmPassword">Confirm new password</label>
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
        {pending ? "Saving…" : "Set new password and sign in"}
      </button>
    </form>
  );
}
