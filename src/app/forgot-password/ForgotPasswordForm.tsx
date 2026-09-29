"use client";

import { useActionState } from "react";
import { requestPasswordResetAction, type ForgotPasswordFormState } from "./actions";

const initialState: ForgotPasswordFormState = {};

// Accessible self-serve password reset request form (ACCESSIBILITY_CHECKLIST.md
// conventions: real label, aria-live confirmation, works without client JS).
// After submitting, ALWAYS shows the same confirmation message, whether or
// not the email matched an account — this is the point, not a bug (Requirement
// 7.2 of the MVP admin & consent enhancements spec: no account enumeration).
export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(requestPasswordResetAction, initialState);

  if (state.submitted) {
    return (
      <div role="status" aria-live="polite" className="alert alert--success" style={{ marginTop: "1.5rem" }}>
        <p style={{ margin: 0 }}>
          If an account exists for that email, we&apos;ve sent a link to reset your password. Check your
          inbox — the link expires in 1 hour and can only be used once.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="form" style={{ marginTop: "1.5rem" }}>
      <div className="field">
        <label htmlFor="email">Email address</label>
        <input id="email" name="email" type="email" autoComplete="email" required className="input" />
      </div>

      <button type="submit" disabled={pending} className="btn btn--primary btn--block">
        {pending ? "Sending…" : "Send reset link"}
      </button>
    </form>
  );
}
