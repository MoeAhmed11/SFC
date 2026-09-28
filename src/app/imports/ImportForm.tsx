"use client";

import { useActionState } from "react";
import { validateImportAction, commitImportAction, type ImportFormState } from "./actions";

const initialState: ImportFormState = {};

// Two-step import flow matching csv/import.ts's design: validate first (writes
// nothing, shows a preview with per-row errors), then commit only once the
// preview is clean. The exact validated text is carried in a hidden field so
// commit acts on what was actually reviewed.
export function ImportForm() {
  const [validateState, validateAction, validating] = useActionState(
    validateImportAction,
    initialState,
  );
  const [commitState, commitAction, committing] = useActionState(
    commitImportAction,
    initialState,
  );

  const state = commitState.result ? commitState : validateState;
  const canCommit = Boolean(validateState.preview && validateState.preview.errors.length === 0 && validateState.csv);

  return (
    <div className="stack">
      <form action={validateAction} className="form">
        <div className="field">
          <label htmlFor="csv">CSV content</label>
          <span className="hint">
            Paste the contents of your CSV file, including the header row. Pasting cells directly
            from Excel or Google Sheets also works.
          </span>
          <textarea
            id="csv"
            name="csv"
            rows={10}
            defaultValue={validateState.csv ?? ""}
            className="textarea textarea--code"
          />
        </div>
        <button type="submit" disabled={validating} className="btn btn--secondary">
          {validating ? "Checking…" : "Check for errors"}
        </button>
      </form>

      <div role="alert" aria-live="polite">
        {state.error ? <p className="alert alert--error">{state.error}</p> : null}
      </div>

      {validateState.preview ? (
        <section aria-live="polite" className="card" style={{ background: "var(--surface-2)" }}>
          <h2 className="card__title">Preview</h2>
          <p>
            {validateState.preview.validRows} of {validateState.preview.totalRows} row
            {validateState.preview.totalRows === 1 ? "" : "s"} are valid.
          </p>
          {validateState.preview.errors.length > 0 ? (
            <ul>
              {validateState.preview.errors.map((e, i) => (
                <li key={i}>
                  Row {e.row === 0 ? "(file)" : e.row}: {e.message}
                </li>
              ))}
            </ul>
          ) : (
            <p className="alert alert--success">No errors found. Ready to import.</p>
          )}

          {canCommit ? (
            <form action={commitAction} style={{ marginTop: "1rem" }}>
              <input type="hidden" name="csv" value={validateState.csv} />
              <button type="submit" disabled={committing} className="btn btn--primary">
                {committing ? "Importing…" : "Import now"}
              </button>
            </form>
          ) : null}
        </section>
      ) : null}

      {commitState.result ? (
        <section role="status" className="card" style={{ borderColor: "var(--success-500)" }}>
          <h2 className="card__title">Import complete</h2>
          <ul className="stats" style={{ marginTop: "0.5rem" }}>
            <li className="stat">
              <div className="stat__value">{commitState.result.pupilsCreated}</div>
              <div className="stat__label">Pupils created</div>
            </li>
            <li className="stat">
              <div className="stat__value">{commitState.result.pupilsMatched}</div>
              <div className="stat__label">Pupils matched</div>
            </li>
            <li className="stat">
              <div className="stat__value">{commitState.result.guardiansCreated}</div>
              <div className="stat__label">Guardians created</div>
            </li>
            <li className="stat">
              <div className="stat__value">{commitState.result.guardiansMatched}</div>
              <div className="stat__label">Guardians matched</div>
            </li>
            <li className="stat">
              <div className="stat__value">{commitState.result.classesCreated}</div>
              <div className="stat__label">Classes created</div>
            </li>
            <li className="stat">
              <div className="stat__value">{commitState.result.relationshipsUpserted}</div>
              <div className="stat__label">Relationships set</div>
            </li>
          </ul>
        </section>
      ) : null}
    </div>
  );
}
