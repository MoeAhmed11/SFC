"use client";

import { useActionState } from "react";
import { createSchoolAction, type PlatformFormState } from "./actions";

const initialState: PlatformFormState = {};

export function CreateSchoolForm() {
  const [state, formAction, pending] = useActionState(createSchoolAction, initialState);

  return (
    <form action={formAction} className="form">
      <div role="alert" aria-live="polite">
        {state.error ? <p className="alert alert--error">{state.error}</p> : null}
        {state.success ? <p className="alert alert--success">{state.success}</p> : null}
      </div>

      <div className="field">
        <label htmlFor="name">School name</label>
        <input id="name" name="name" type="text" required className="input" />
      </div>
      <div className="field">
        <label htmlFor="schoolType">School type</label>
        <select id="schoolType" name="schoolType" defaultValue="state" className="select">
          <option value="state">state</option>
          <option value="independent">independent</option>
        </select>
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
        {pending ? "Creating…" : "Create school"}
      </button>
    </form>
  );
}
