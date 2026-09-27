"use client";

import { useActionState } from "react";
import { inviteStaffAction, type StaffFormState } from "./actions";

const initialState: StaffFormState = {};

export function InviteStaffForm() {
  const [state, formAction, pending] = useActionState(inviteStaffAction, initialState);

  return (
    <form action={formAction} className="form">
      <div role="alert" aria-live="polite">
        {state.error ? <p className="alert alert--error">{state.error}</p> : null}
      </div>

      <div className="field">
        <label htmlFor="name">Name</label>
        <input id="name" name="name" type="text" required className="input" />
      </div>
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" required className="input" />
      </div>
      <div className="field">
        <label htmlFor="role">Role</label>
        <select id="role" name="role" defaultValue="organiser" className="select">
          <option value="organiser">organiser</option>
          <option value="admin">admin</option>
        </select>
      </div>

      <button type="submit" disabled={pending} className="btn btn--primary">
        {pending ? "Inviting…" : "Send invite"}
      </button>

      {state.inviteUrl ? (
        <div role="status" className="alert alert--success">
          <p style={{ marginTop: 0 }}>
            Invited. There is no email provider configured yet, so send this link to them directly (it
            expires in 7 days and works once):
          </p>
          <code className="token-box">{state.inviteUrl}</code>
        </div>
      ) : null}
    </form>
  );
}
