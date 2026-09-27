"use client";

import { useActionState, useState } from "react";
import {
  cancelEventAction,
  completeEventAction,
  publishEventAction,
  type EventActionState,
} from "./actions";

const initial: EventActionState = {};

interface ClassOption {
  id: string;
  name: string;
}

// Status-appropriate actions for an event (FR-02 lifecycle). Cancellation is
// destructive (suppresses reminders and revokes parent links) so it requires
// an explicit confirmation step rather than firing on a single click.
export function EventActions({
  eventId,
  status,
  classes,
}: {
  eventId: string;
  status: string;
  classes: ClassOption[];
}) {
  const boundCancel = cancelEventAction.bind(null, eventId);
  const boundComplete = completeEventAction.bind(null, eventId);

  const [publishState, publishFormAction, publishPending] = useActionState(
    (state: EventActionState, formData: FormData) => {
      const classGroupId = String(formData.get("classGroupId") ?? "");
      return publishEventAction(eventId, classGroupId || undefined, state, formData);
    },
    initial,
  );
  const [cancelState, cancelFormAction, cancelPending] = useActionState(boundCancel, initial);
  const [completeState, completeFormAction, completePending] = useActionState(boundComplete, initial);
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  return (
    <div className="stack" style={{ marginTop: "1.5rem", gap: "1rem" }}>
      {status === "draft" ? (
        <form action={publishFormAction} className="toolbar" style={{ alignItems: "flex-end" }}>
          <div className="field">
            <label htmlFor="publish-classGroupId">Publish to class (optional)</label>
            <select id="publish-classGroupId" name="classGroupId" className="select">
              <option value="">Whole school</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" disabled={publishPending} className="btn btn--primary">
            {publishPending ? "Publishing…" : "Publish"}
          </button>
        </form>
      ) : null}
      {publishState.error ? (
        <p role="alert" className="alert alert--error">
          {publishState.error}
        </p>
      ) : null}

      {status === "published" ? (
        <form action={completeFormAction}>
          <button type="submit" disabled={completePending} className="btn btn--secondary">
            {completePending ? "Marking complete…" : "Mark completed"}
          </button>
        </form>
      ) : null}
      {completeState.error ? (
        <p role="alert" className="alert alert--error">
          {completeState.error}
        </p>
      ) : null}

      {status === "draft" || status === "published" ? (
        <div>
          {!confirmingCancel ? (
            <button
              type="button"
              onClick={() => setConfirmingCancel(true)}
              className="btn btn--ghost"
              style={{ color: "var(--danger-700)" }}
            >
              Cancel event
            </button>
          ) : (
            <div
              role="alertdialog"
              aria-label="Confirm cancellation"
              className="alert alert--warning"
              style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}
            >
              <p style={{ margin: 0 }}>
                Cancelling will revoke parent links and stop all pending reminders for this event. This
                cannot be undone. Are you sure?
              </p>
              <div className="toolbar">
                <form action={cancelFormAction}>
                  <button type="submit" disabled={cancelPending} className="btn btn--danger">
                    {cancelPending ? "Cancelling…" : "Yes, cancel event"}
                  </button>
                </form>
                <button
                  type="button"
                  onClick={() => setConfirmingCancel(false)}
                  className="btn btn--secondary"
                >
                  No, go back
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}
      {cancelState.error ? (
        <p role="alert" className="alert alert--error">
          {cancelState.error}
        </p>
      ) : null}
    </div>
  );
}
