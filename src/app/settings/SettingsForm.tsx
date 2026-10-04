"use client";

import { useActionState } from "react";
import { updateSettingsAction, type SettingsFormState } from "./actions";
import { MIN_RETENTION_YEARS, MAX_RETENTION_YEARS, type SchoolSettings } from "@/server/schoolSettings";

const initial: SettingsFormState = {};

export interface SettingsFormProps {
  settings: SchoolSettings;
}

export function SettingsForm({ settings }: SettingsFormProps) {
  const [state, formAction, pending] = useActionState(updateSettingsAction, initial);

  return (
    <form action={formAction} className="form">
      <div role="alert" aria-live="polite">
        {state.error ? <p className="alert alert--error">{state.error}</p> : null}
        {state.success ? <p className="alert alert--success">{state.success}</p> : null}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <input
          id="allowConsentEditing"
          name="allowConsentEditing"
          type="checkbox"
          defaultChecked={settings.allowConsentEditing}
        />
        <label htmlFor="allowConsentEditing" style={{ fontWeight: 400 }}>
          Allow parents to change a previously submitted consent response
        </label>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <input
          id="allowLateConsent"
          name="allowLateConsent"
          type="checkbox"
          defaultChecked={settings.allowLateConsent}
        />
        <label htmlFor="allowLateConsent" style={{ fontWeight: 400 }}>
          Allow consent to be submitted after the deadline has passed
        </label>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <input
          id="allowOfflineConsent"
          name="allowOfflineConsent"
          type="checkbox"
          defaultChecked={settings.allowOfflineConsent}
        />
        <label htmlFor="allowOfflineConsent" style={{ fontWeight: 400 }}>
          Allow staff to record offline/paper consent
        </label>
      </div>

      <div className="field">
        <label htmlFor="dataRetentionYears">Data retention (years)</label>
        <input
          id="dataRetentionYears"
          name="dataRetentionYears"
          type="number"
          min={MIN_RETENTION_YEARS}
          max={MAX_RETENTION_YEARS}
          required
          defaultValue={settings.dataRetentionYears}
          className="input"
          style={{ maxWidth: 120 }}
        />
        <span className="hint">
          How long consent responses, notifications, and audit log entries are kept ({MIN_RETENTION_YEARS}
          –{MAX_RETENTION_YEARS} years).
        </span>
      </div>

      <button type="submit" disabled={pending} className="btn btn--primary">
        {pending ? "Saving…" : "Save settings"}
      </button>
    </form>
  );
}
