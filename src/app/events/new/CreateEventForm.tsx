"use client";

import { useActionState } from "react";
import { createEventAction, type CreateEventFormState } from "./actions";

const initialState: CreateEventFormState = {};

interface ClassOption {
  id: string;
  name: string;
}

// Accessible event creation form (see ACCESSIBILITY_CHECKLIST.md): every field
// has a real <label>, the error is announced via aria-live, and the class
// selector is optional (an event with no class targets the whole school at
// publish time).
export function CreateEventForm({ classes }: { classes: ClassOption[] }) {
  const [state, formAction, pending] = useActionState(createEventAction, initialState);

  return (
    <form action={formAction} className="form">
      <div role="alert" aria-live="polite">
        {state.error ? <p className="alert alert--error">{state.error}</p> : null}
      </div>

      <Field label="Title" name="title" type="text" required />
      <Field label="Description" name="description" type="text" as="textarea" />
      <Field label="Location" name="location" type="text" />
      <Field label="Starts at" name="startsAt" type="datetime-local" required />
      <Field label="Ends at" name="endsAt" type="datetime-local" required />
      <Field label="Consent deadline" name="consentDeadline" type="datetime-local" required />

      <div className="field">
        <label htmlFor="classGroupId">Class</label>
        <span className="hint">Leave blank to target the whole school.</span>
        <select id="classGroupId" name="classGroupId" className="select">
          <option value="">Whole school</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <button type="submit" disabled={pending} className="btn btn--primary">
        {pending ? "Creating…" : "Create draft event"}
      </button>
    </form>
  );
}

function Field({
  label,
  name,
  type,
  required,
  as,
}: {
  label: string;
  name: string;
  type: string;
  required?: boolean;
  as?: "textarea";
}) {
  return (
    <div className="field">
      <label htmlFor={name}>
        {label}
        {required ? <span className="hint"> (required)</span> : null}
      </label>
      {as === "textarea" ? (
        <textarea id={name} name={name} rows={3} className="textarea" />
      ) : (
        <input id={name} name={name} type={type} required={required} className="input" />
      )}
    </div>
  );
}
