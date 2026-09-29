"use client";

import { useActionState, useState } from "react";
import { archivePupilAction, updatePupilAction, type PupilActionState } from "./actions";

const initial: PupilActionState = {};

interface ClassOption {
  id: string;
  name: string;
}

interface PupilActionsProps {
  pupilId: string;
  firstName: string;
  lastName: string;
  classGroupId: string | null;
  status: string;
  classes: ClassOption[];
}

// Edit + archive actions for a pupil roster record (Requirement 1). Archiving
// is a soft delete (status -> "archived", never a row removal) so it gets the
// same explicit-confirmation treatment as event cancellation in
// EventActions.tsx, since it changes what shows up in the active roster.
export function PupilActions({ pupilId, firstName, lastName, classGroupId, status, classes }: PupilActionsProps) {
  const boundUpdate = updatePupilAction.bind(null, pupilId);
  const boundArchive = archivePupilAction.bind(null, pupilId);

  const [updateState, updateFormAction, updatePending] = useActionState(boundUpdate, initial);
  const [archiveState, archiveFormAction, archivePending] = useActionState(boundArchive, initial);
  const [confirmingArchive, setConfirmingArchive] = useState(false);

  return (
    <div className="stack" style={{ gap: "1.5rem" }}>
      <form action={updateFormAction} className="form">
        <div role="alert" aria-live="polite">
          {updateState.error ? <p className="alert alert--error">{updateState.error}</p> : null}
          {updateState.success ? <p className="alert alert--success">{updateState.success}</p> : null}
        </div>

        <div className="field">
          <label htmlFor="firstName">First name</label>
          <input id="firstName" name="firstName" type="text" required defaultValue={firstName} className="input" />
        </div>
        <div className="field">
          <label htmlFor="lastName">Last name</label>
          <input id="lastName" name="lastName" type="text" required defaultValue={lastName} className="input" />
        </div>
        <div className="field">
          <label htmlFor="classGroupId">Class</label>
          <select id="classGroupId" name="classGroupId" className="select" defaultValue={classGroupId ?? ""}>
            <option value="">No class</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="status">Status</label>
          <select id="status" name="status" className="select" defaultValue={status}>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
        </div>

        <button type="submit" disabled={updatePending} className="btn btn--primary">
          {updatePending ? "Saving…" : "Save changes"}
        </button>
      </form>

      {status !== "archived" ? (
        <div>
          {!confirmingArchive ? (
            <button
              type="button"
              onClick={() => setConfirmingArchive(true)}
              className="btn btn--ghost"
              style={{ color: "var(--danger-700)" }}
            >
              Archive pupil
            </button>
          ) : (
            <div
              role="alertdialog"
              aria-label="Confirm archive"
              className="alert alert--warning"
              style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}
            >
              <p style={{ margin: 0 }}>
                Archiving removes this pupil from the active roster and from new event recipient
                selection. Their consent history is kept in full. Are you sure?
              </p>
              <div className="toolbar">
                <form action={archiveFormAction}>
                  <button type="submit" disabled={archivePending} className="btn btn--danger">
                    {archivePending ? "Archiving…" : "Yes, archive pupil"}
                  </button>
                </form>
                <button type="button" onClick={() => setConfirmingArchive(false)} className="btn btn--secondary">
                  No, go back
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}
      {archiveState.error ? (
        <p role="alert" className="alert alert--error">
          {archiveState.error}
        </p>
      ) : null}
      {archiveState.success ? (
        <p role="status" className="alert alert--success">
          {archiveState.success}
        </p>
      ) : null}
    </div>
  );
}
