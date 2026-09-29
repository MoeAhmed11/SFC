"use client";

import { useActionState, useState } from "react";
import {
  changeRoleAction,
  deactivateStaffAction,
  deleteStaffAction,
  sendPasswordResetAction,
  type StaffFormState,
} from "./actions";
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
  const boundDelete = deleteStaffAction.bind(null, id);
  const boundSendReset = sendPasswordResetAction.bind(null, id);
  const [roleState, roleFormAction, rolePending] = useActionState(boundChangeRole, initial);
  const [deactivateState, deactivateFormAction, deactivatePending] = useActionState(
    boundDeactivate,
    initial,
  );
  const [deleteState, deleteFormAction, deletePending] = useActionState(boundDelete, initial);
  const [resetState, resetFormAction, resetPending] = useActionState(boundSendReset, initial);
  const [confirming, setConfirming] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

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
        {isSelf ? (
          <span className="muted">This is you</span>
        ) : (
          <div className="stack" style={{ gap: "0.5rem" }}>
            {status === "active" ? (
              <form action={resetFormAction}>
                <button type="submit" disabled={resetPending} className="btn btn--secondary btn--sm">
                  {resetPending ? "Sending…" : "Send password reset"}
                </button>
              </form>
            ) : null}

            {status !== "deactivated" ? (
              <div className="toolbar" style={{ gap: "0.5rem" }}>
                {confirming ? (
                  <>
                    <span>Are you sure?</span>
                    <form action={deactivateFormAction}>
                      <button type="submit" disabled={deactivatePending} className="btn btn--danger btn--sm">
                        Yes, deactivate
                      </button>
                    </form>
                    <button type="button" onClick={() => setConfirming(false)} className="btn btn--secondary btn--sm">
                      Cancel
                    </button>
                  </>
                ) : (
                  <button type="button" onClick={() => setConfirming(true)} className="btn btn--ghost btn--sm">
                    Deactivate
                  </button>
                )}

                {!confirming && !confirmingDelete ? (
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(true)}
                    className="btn btn--ghost btn--sm"
                    style={{ color: "var(--danger-700)" }}
                  >
                    Delete
                  </button>
                ) : null}
              </div>
            ) : (
              <span className="muted">Deactivated accounts cannot be deleted.</span>
            )}

            {confirmingDelete ? (
              <div
                role="alertdialog"
                aria-label={`Confirm delete for ${name}`}
                className="alert alert--warning"
                style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}
              >
                <p style={{ margin: 0, fontSize: "0.85rem" }}>
                  This permanently removes the account. If they&apos;ve created any events, they&apos;ll be
                  deactivated instead and this won&apos;t succeed.
                </p>
                <div className="toolbar" style={{ gap: "0.5rem" }}>
                  <form action={deleteFormAction}>
                    <button type="submit" disabled={deletePending} className="btn btn--danger btn--sm">
                      {deletePending ? "Deleting…" : "Yes, delete"}
                    </button>
                  </form>
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(false)}
                    className="btn btn--secondary btn--sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        )}
        {deactivateState.error ? (
          <p role="alert" className="alert alert--error" style={{ marginTop: "0.5rem" }}>
            {deactivateState.error}
          </p>
        ) : null}
        {deleteState.error ? (
          <p role="alert" className="alert alert--error" style={{ marginTop: "0.5rem" }}>
            {deleteState.error}
          </p>
        ) : null}
        {resetState.error ? (
          <p role="alert" className="alert alert--error" style={{ marginTop: "0.5rem" }}>
            {resetState.error}
          </p>
        ) : null}
        {resetState.success ? (
          <p role="status" className="alert alert--success" style={{ marginTop: "0.5rem" }}>
            {resetState.success}
          </p>
        ) : null}
      </td>
    </tr>
  );
}
