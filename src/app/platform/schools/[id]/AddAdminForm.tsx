"use client";

import { useActionState } from "react";
import { createAdminAction, type PlatformFormState } from "../../actions";

const initialState: PlatformFormState = {};

export function AddAdminForm({ schoolId }: { schoolId: string }) {
  const action = createAdminAction.bind(null, schoolId);
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="form">
      <div role="alert" aria-live="polite">
        {state.error ? <p className="alert alert--error">{state.error}</p> : null}
        {state.success ? <p className="alert alert--success">{state.success}</p> : null}
      </div>

      <div className="field">
        <label htmlFor="adminName">Admin name</label>
        <input id="adminName" name="adminName" type="text" required className="input" />
      </div>
      <div className="field">
        <label htmlFor="adminEmail">Admin email</label>
        <input id="adminEmail" name="adminEmail" type="email" required className="input" />
      </div>
      <div className="field">
        <label htmlFor="adminPassword">Admin password</label>
        <input
          id="adminPassword"
          name="adminPassword"
          type="password"
          required
          minLength={12}
          className="input"
        />
        <p className="hint">At least 12 characters, with upper, lower, digit, and symbol.</p>
      </div>

      <button type="submit" disabled={pending} className="btn btn--primary">
        {pending ? "Creating…" : "Create and activate admin"}
      </button>
    </form>
  );
}
