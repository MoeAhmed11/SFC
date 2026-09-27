"use client";

import { useActionState, useState } from "react";
import { changeRoleAction, deactivateStaffAction, type StaffFormState } from "./actions";
import { StatusBadge } from "../StatusBadge";

const initial: StaffFormState = {};

interface StaffRowProps {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  isSelf: boolean;
}

export function StaffRow({ id, name, email, role, status, isSelf }: StaffRowProps) {
  const boundChangeRole = changeRoleAction.bind(null, id);
  const boundDeactivate = deactivateStaffAction.bind(null, id);
  const [roleState, roleFormAction, rolePending] = useActionState(boundChangeRole, initial);
  const [deactivateState, deactivateFormAction, deactivatePending] = useActionState(
    boundDeactivate,
    initial,
  );
  const [confirming, setConfirming] = useState(false);

  return (
    <tr>
      <td>{name}</td>
      <td>{email}</td>
      <td>
        {status === "deactivated" ? (
          <span className="muted">{role}</span>
        ) : (
          <form action={roleFormAction} className="toolbar" style={{ gap: "0.5rem" }}>
            <label htmlFor={`role-${id}`} style={{ position: "absolute", left: "-9999px" }}>
              Role for {name}
            </label>
            <select id={`role-${id}`} name="role" defaultValue={role} className="select" style={{ width: "auto" }}>
              <option value="admin">admin</option>
              <option value="organiser">organiser</option>
            </select>
            <button type="submit" disabled={rolePending} className="btn btn--secondary btn--sm">
              {rolePending ? "Saving…" : "Save"}
            </button>
          </form>
        )}
        {roleState.error ? (
          <p role="alert" className="alert alert--error" style={{ marginTop: "0.5rem" }}>
            {roleState.error}
          </p>
        ) : null}
      </td>
      <td>
        <StatusBadge status={status} />
      </td>
      <td>
        {status !== "deactivated" && !isSelf ? (
          confirming ? (
            <div className="toolbar" style={{ gap: "0.5rem" }}>
              <span>Are you sure?</span>
              <form action={deactivateFormAction}>
                <button type="submit" disabled={deactivatePending} className="btn btn--danger btn--sm">
                  Yes, deactivate
                </button>
              </form>
              <button type="button" onClick={() => setConfirming(false)} className="btn btn--secondary btn--sm">
                Cancel
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirming(true)} className="btn btn--ghost btn--sm">
              Deactivate
            </button>
          )
        ) : null}
        {deactivateState.error ? (
          <p role="alert" className="alert alert--error" style={{ marginTop: "0.5rem" }}>
            {deactivateState.error}
          </p>
        ) : null}
      </td>
    </tr>
  );
}
