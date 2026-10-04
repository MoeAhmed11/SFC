"use client";

import { useActionState } from "react";
import { platformLoginAction, type PlatformLoginFormState } from "./actions";

const initialState: PlatformLoginFormState = {};

// Accessible login form, mirroring src/app/login/LoginForm.tsx:
//  - every field has a real, associated <label>
//  - the error message is associated with the form via aria-live so assistive
//    tech announces it without requiring focus to move
//  - no colour-only signalling; the error is text
export function PlatformLoginForm() {
  const [state, formAction, pending] = useActionState(platformLoginAction, initialState);

  return (
    <form action={formAction} className="form" style={{ marginTop: "1.5rem" }}>
      <div role="alert" aria-live="polite">
        {state.error ? <p className="alert alert--error">{state.error}</p> : null}
      </div>

      <div className="field">
        <label htmlFor="email">Email address</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="input"
        />
      </div>

      <div className="field">
        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="input"
        />
      </div>

      <button type="submit" disabled={pending} className="btn btn--primary btn--block">
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
