"use client";

import { useRef } from "react";

interface ClassOption {
  id: string;
  name: string;
}

interface PupilFiltersProps {
  classes: ClassOption[];
  classGroupId: string | undefined;
  status: string;
}

// Progressive enhancement: the form still works with JS disabled via the
// "Apply filters" submit button, but when JS is available, changing either
// dropdown submits immediately -- narrowing a list is one gesture, not two
// (audit finding: "Apply filters requires a full round trip").
export function PupilFilters({ classes, classGroupId, status }: PupilFiltersProps) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      className="toolbar"
      style={{ marginBottom: "1rem", alignItems: "flex-end" }}
      method="get"
    >
      <div className="field">
        <label htmlFor="classGroupId">Class</label>
        <select
          id="classGroupId"
          name="classGroupId"
          className="select"
          defaultValue={classGroupId ?? ""}
          onChange={() => formRef.current?.requestSubmit()}
        >
          <option value="">All classes</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="status">Status</label>
        <select
          id="status"
          name="status"
          className="select"
          defaultValue={status}
          onChange={() => formRef.current?.requestSubmit()}
        >
          <option value="active">Active</option>
          <option value="archived">Archived</option>
          <option value="all">All</option>
        </select>
      </div>
      <button type="submit" className="btn btn--secondary btn--sm">
        Apply filters
      </button>
    </form>
  );
}
