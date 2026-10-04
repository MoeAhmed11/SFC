"use client";

import { useActionState } from "react";
import { updateGuardianAction, updateRelationshipAction, type PupilActionState } from "./actions";

const initial: PupilActionState = {};

export interface GuardianActionsProps {
  pupilId: string;
  guardianId: string;
  name: string;
  email: string;
  relationship: string | null;
  isAuthorised: boolean;
  isPrimaryContact: boolean;
}

// Edit a linked guardian's contact details and relationship flags from the
// pupil detail page. Two separate forms/actions (contact details vs.
// relationship flags), mirroring PupilActions.tsx's separation of concerns —
// one saves Guardian.name/email, the other saves the
// PupilGuardianRelationship row (label, authorised, primary contact).
// Setting "Primary contact" here automatically clears any other guardian's
// primary-contact flag for this pupil (enforced server-side in
// linkGuardianToPupil / clearPrimaryForPupil) since at most one guardian can
// be the primary contact per pupil.
export function GuardianActions({
  pupilId,
  guardianId,
  name,
  email,
  relationship,
  isAuthorised,
  isPrimaryContact,
}: GuardianActionsProps) {
  const boundUpdateGuardian = updateGuardianAction.bind(null, pupilId, guardianId);
  const boundUpdateRelationship = updateRelationshipAction.bind(null, pupilId, guardianId);

  const [contactState, contactFormAction, contactPending] = useActionState(boundUpdateGuardian, initial);
  const [relState, relFormAction, relPending] = useActionState(boundUpdateRelationship, initial);

  return (
    <div className="stack" style={{ gap: "1rem" }}>
      <form action={contactFormAction} className="form">
        <div role="alert" aria-live="polite">
          {contactState.error ? <p className="alert alert--error">{contactState.error}</p> : null}
          {contactState.success ? <p className="alert alert--success">{contactState.success}</p> : null}
        </div>

        <div className="field">
          <label htmlFor={`guardian-name-${guardianId}`}>Guardian name</label>
          <input
            id={`guardian-name-${guardianId}`}
            name="name"
            type="text"
            required
            defaultValue={name}
            className="input"
          />
        </div>
        <div className="field">
          <label htmlFor={`guardian-email-${guardianId}`}>Guardian email</label>
          <input
            id={`guardian-email-${guardianId}`}
            name="email"
            type="email"
            required
            defaultValue={email}
            className="input"
          />
        </div>

        <button type="submit" disabled={contactPending} className="btn btn--secondary btn--sm">
          {contactPending ? "Saving…" : "Save contact details"}
        </button>
      </form>

      <form action={relFormAction} className="form">
        <div role="alert" aria-live="polite">
          {relState.error ? <p className="alert alert--error">{relState.error}</p> : null}
          {relState.success ? <p className="alert alert--success">{relState.success}</p> : null}
        </div>

        <div className="field">
          <label htmlFor={`relationship-${guardianId}`}>Relationship</label>
          <input
            id={`relationship-${guardianId}`}
            name="relationship"
            type="text"
            placeholder="e.g. Mother, Father, Carer"
            defaultValue={relationship ?? ""}
            className="input"
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <input
            id={`isAuthorised-${guardianId}`}
            name="isAuthorised"
            type="checkbox"
            defaultChecked={isAuthorised}
          />
          <label htmlFor={`isAuthorised-${guardianId}`} style={{ fontWeight: 400 }}>
            Authorised contact for this pupil
          </label>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <input
            id={`isPrimaryContact-${guardianId}`}
            name="isPrimaryContact"
            type="checkbox"
            defaultChecked={isPrimaryContact}
          />
          <label htmlFor={`isPrimaryContact-${guardianId}`} style={{ fontWeight: 400 }}>
            Primary contact (receives consent requests and reminders)
          </label>
        </div>

        <button type="submit" disabled={relPending} className="btn btn--secondary btn--sm">
          {relPending ? "Saving…" : "Save relationship"}
        </button>
      </form>
    </div>
  );
}
