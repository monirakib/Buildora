"use client";

import { EMPLOYMENT_TYPES } from "@buildora/shared";
import { Field, StepHeader, addButton, entryBox, input, removeButton } from "../ui";
import { stepCopy } from "../roles";
import { emptyExperience, type StepProps } from "../form";

/** Work history, newest first. */
export function ExperienceStep({ form, patch, role }: StepProps) {
  const copy = stepCopy("experience", role);
  const setEntry = (i: number, changes: Partial<(typeof form.experience)[number]>) =>
    patch({ experience: form.experience.map((x, j) => (j === i ? { ...x, ...changes } : x)) });
  const remove = (i: number) => patch({ experience: form.experience.filter((_, j) => j !== i) });

  return (
    <div>
      <StepHeader title={copy.title} subtitle={copy.subtitle} />

      <div className="flex flex-col gap-4">
        {form.experience.map((entry, i) => (
          <div key={i} className={entryBox}>
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-bold text-stone-800 dark:text-slate-200">
                Position {i + 1}
              </p>
              <button type="button" onClick={() => remove(i)} className={removeButton}>
                Remove
              </button>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field title="Company" required>
                <input
                  type="text"
                  required
                  value={entry.company}
                  onChange={(e) => setEntry(i, { company: e.target.value })}
                  className={input}
                />
              </Field>
              <Field title="Designation" required>
                <input
                  type="text"
                  required
                  placeholder="e.g. Senior Architect"
                  value={entry.designation}
                  onChange={(e) => setEntry(i, { designation: e.target.value })}
                  className={input}
                />
              </Field>
              <Field title="Employment Type">
                <select
                  value={entry.employmentType}
                  onChange={(e) => setEntry(i, { employmentType: e.target.value })}
                  className={input}
                >
                  <option value="">Select…</option>
                  {EMPLOYMENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field title="Start">
                  <input
                    type="month"
                    value={entry.startDate}
                    onChange={(e) => setEntry(i, { startDate: e.target.value })}
                    className={input}
                  />
                </Field>
                <Field title="End">
                  <input
                    type="month"
                    value={entry.endDate}
                    disabled={entry.isCurrent}
                    onChange={(e) => setEntry(i, { endDate: e.target.value })}
                    className={input}
                  />
                </Field>
              </div>
            </div>
            <label className="mt-3 flex items-center gap-2.5 text-sm font-semibold text-stone-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={entry.isCurrent}
                onChange={(e) => setEntry(i, { isCurrent: e.target.checked })}
                className="h-4 w-4 accent-[#F5B400]"
              />
              I currently work here
            </label>
            <textarea
              rows={3}
              maxLength={1000}
              placeholder="Responsibilities and major projects…"
              value={entry.description}
              onChange={(e) => setEntry(i, { description: e.target.value })}
              className={`${input} mt-3`}
            />
          </div>
        ))}

        {form.experience.length < 15 && (
          <button
            type="button"
            onClick={() => patch({ experience: [...form.experience, { ...emptyExperience }] })}
            className={addButton}
          >
            + Add Position
          </button>
        )}
      </div>
    </div>
  );
}
