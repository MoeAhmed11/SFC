"use client";

import { useEffect, useRef, useState } from "react";
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

  const [csvText, setCsvText] = useState(validateState.csv ?? "");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  // Keep the textarea in sync when a fresh validate/commit result replaces
  // the carried-forward csv value (e.g. after navigating back).
  useEffect(() => {
    if (validateState.csv !== undefined) setCsvText(validateState.csv);
  }, [validateState.csv]);

  const state = commitState.result ? commitState : validateState;
  const canCommit = Boolean(validateState.preview && validateState.preview.errors.length === 0 && validateState.csv);

  // Row count counts data rows only (excludes header + trailing blank line),
  // mirroring server-side totalRows so a bad paste is obvious before
  // "Check for errors" is even clicked (audit: no pre-submit sanity check).
  const lines = csvText.split(/\r\n|\r|\n/);
  const nonEmptyLines = lines.filter((l) => l.trim() !== "");
  const dataRowCount = Math.max(nonEmptyLines.length - 1, 0);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileError(null);
    if (!file.name.toLowerCase().endsWith(".csv") && file.type !== "text/csv") {
      setFileError("That doesn't look like a CSV file. Choose a .csv file, or paste content directly.");
      e.target.value = "";
      return;
    }
    try {
      const text = await file.text();
      setCsvText(text);
    } catch {
      setFileError("Couldn't read that file. Try pasting the content directly instead.");
    } finally {
      e.target.value = "";
    }
  }

  function jumpToLine(lineNumber: number) {
    const textarea = textareaRef.current;
    if (!textarea || lineNumber < 1) return;
    textarea.focus();
    const linesUpTo = lines.slice(0, lineNumber);
    const start = linesUpTo.slice(0, -1).reduce((acc, l) => acc + l.length + 1, 0);
    const end = start + (lines[lineNumber - 1]?.length ?? 0);
    textarea.setSelectionRange(start, end);
    textarea.scrollTop = Math.max(0, (lineNumber - 3) * 20);
    if (gutterRef.current) gutterRef.current.scrollTop = textarea.scrollTop;
  }

  return (
    <div className="stack">
      <form action={validateAction} className="form">
        <div className="field">
          <label htmlFor="csv">Paste your roster (CSV)</label>
          <span className="hint">
            Paste the contents of your CSV file, including the header row, or upload a .csv file
            below. Pasting cells directly from Excel or Google Sheets also works.
          </span>
          <div className="toolbar" style={{ marginBottom: "0.5rem" }}>
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={() => fileInputRef.current?.click()}
            >
              Upload CSV file…
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              aria-label="Upload CSV file"
              onChange={handleFileChange}
            />
            {csvText.trim() ? (
              <span className="muted" aria-live="polite">
                {dataRowCount} data row{dataRowCount === 1 ? "" : "s"} detected
              </span>
            ) : null}
          </div>
          {fileError ? <p className="alert alert--error">{fileError}</p> : null}
          <div className="textarea-gutter-wrap">
            <div className="textarea-gutter" aria-hidden="true" ref={gutterRef}>
              {lines.map((_, i) => (
                <div key={i}>{i + 1}</div>
              ))}
            </div>
            <textarea
              ref={textareaRef}
              id="csv"
              name="csv"
              rows={10}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              onScroll={(e) => {
                if (gutterRef.current) {
                  gutterRef.current.scrollTop = e.currentTarget.scrollTop;
                }
              }}
              className="textarea textarea--code textarea--gutter"
            />
          </div>
        </div>
        <button type="submit" disabled={validating} className="btn btn--secondary">
          {validating ? "Checking…" : "Check for errors"}
        </button>
      </form>

      <div role="alert" aria-live="polite">
        {state.error ? <p className="alert alert--error">{state.error}</p> : null}
      </div>

      {validateState.preview ? (
        <section aria-live="polite" className="card card--muted">
          <h2 className="card__title">Preview</h2>
          <p>
            {validateState.preview.validRows} of {validateState.preview.totalRows} row
            {validateState.preview.totalRows === 1 ? "" : "s"} are valid.
          </p>
          {validateState.preview.errors.length > 0 ? (
            <ul aria-label={`Import errors (${validateState.preview.errors.length})`}>
              {validateState.preview.errors.map((e, i) =>
                e.row === 0 ? (
                  <li key={i}>Row (file): {e.message}</li>
                ) : (
                  <li key={i}>
                    <button
                      type="button"
                      onClick={() => jumpToLine(e.row + 1)}
                      className="link-as-text"
                      title="Jump to this row in the CSV content above"
                    >
                      Row {e.row}
                    </button>
                    : {e.message}
                  </li>
                ),
              )}
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
              <p className="hint" style={{ marginTop: "0.5rem" }}>
                Guardians are matched by email and pupils with an external reference are matched
                by that reference, so re-running this import on the same data won&apos;t create
                duplicates for them. Pupils with no external reference are always created as new.
                Each imported guardian becomes that pupil&apos;s primary contact, replacing any
                existing one.
              </p>
            </form>
          ) : null}
        </section>
      ) : null}

      {commitState.result ? (
        <section role="status" className="card card--success">
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
