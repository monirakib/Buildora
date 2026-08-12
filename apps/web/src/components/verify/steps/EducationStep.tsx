"use client";

import { Field, StepHeader, addButton, entryBox, input, removeButton } from "../ui";
import { UploadZone } from "../UploadZone";
import { stepCopy } from "../roles";
import { emptyEducation, type StepProps } from "../form";

/** Degrees with certificate/transcript uploads. */
export function EducationStep({ form, patch, onError, role }: StepProps) {
  const copy = stepCopy("education", role);
  // Immutable helpers: rebuild the array, then patch the whole list.
  const setEntry = (i: number, changes: Partial<(typeof form.education)[number]>) =>
    patch({ education: form.education.map((e, j) => (j === i ? { ...e, ...changes } : e)) });
  const remove = (i: number) => patch({ education: form.education.filter((_, j) => j !== i) });

  return (
    <div>
      <StepHeader title={copy.title} subtitle={copy.subtitle} />

      <div className="flex flex-col gap-4">
        {form.education.map((entry, i) => (
          <div key={i} className={entryBox}>
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-bold text-stone-800 dark:text-slate-200">
                Qualification {i + 1}
              </p>
              <button type="button" onClick={() => remove(i)} className={removeButton}>
                Remove
              </button>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field title="Degree" required>
                <input
                  type="text"
                  required
                  placeholder="e.g. B.Arch"
                  value={entry.degree}
                  onChange={(e) => setEntry(i, { degree: e.target.value })}
                  className={input}
                />
              </Field>
              <Field title="University" required>
                <input
                  type="text"
                  required
                  placeholder="e.g. BUET"
                  value={entry.institution}
                  onChange={(e) => setEntry(i, { institution: e.target.value })}
                  className={input}
                />
              </Field>
              <Field title="Department">
                <input
                  type="text"
                  placeholder="e.g. Architecture"
                  value={entry.department}
                  onChange={(e) => setEntry(i, { department: e.target.value })}
                  className={input}
                />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field title="Passing Year">
                  <input
                    type="number"
                    min={1950}
                    max={2100}
                    value={entry.year}
                    onChange={(e) => setEntry(i, { year: e.target.value })}
                    className={input}
                  />
                </Field>
                <Field title="CGPA">
                  <input
                    type="text"
                    placeholder="3.75 / 4.00"
                    value={entry.cgpa}
                    onChange={(e) => setEntry(i, { cgpa: e.target.value })}
                    className={input}
                  />
                </Field>
              </div>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <UploadZone
                title="Certificate"
                required
                compact
                value={entry.certificateUrl}
                onChange={(url) => setEntry(i, { certificateUrl: url })}
                onError={onError}
              />
              <UploadZone
                title="Transcript"
                compact
                value={entry.transcriptUrl}
                onChange={(url) => setEntry(i, { transcriptUrl: url })}
                onError={onError}
              />
            </div>
          </div>
        ))}

        {form.education.length < 10 && (
          <button
            type="button"
            onClick={() => patch({ education: [...form.education, { ...emptyEducation }] })}
            className={addButton}
          >
            + Add Qualification
          </button>
        )}
      </div>
    </div>
  );
}
