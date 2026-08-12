"use client";

import { Field, StepHeader, addButton, entryBox, input, removeButton } from "../ui";
import { stepCopy } from "../roles";
import { emptyAchievement, type StepProps } from "../form";

/** Awards, competitions, research, publications, memberships. */
export function AchievementsStep({ form, patch, role }: StepProps) {
  const copy = stepCopy("achievements", role);
  const setEntry = (i: number, changes: Partial<(typeof form.achievements)[number]>) =>
    patch({ achievements: form.achievements.map((a, j) => (j === i ? { ...a, ...changes } : a)) });
  const remove = (i: number) =>
    patch({ achievements: form.achievements.filter((_, j) => j !== i) });

  return (
    <div>
      <StepHeader title={copy.title} subtitle={copy.subtitle} />

      <div className="flex flex-col gap-4">
        {form.achievements.map((entry, i) => (
          <div key={i} className={entryBox}>
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-bold text-stone-800 dark:text-slate-200">
                Achievement {i + 1}
              </p>
              <button type="button" onClick={() => remove(i)} className={removeButton}>
                Remove
              </button>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_8rem]">
              <Field title="Title" required>
                <input
                  type="text"
                  required
                  placeholder="e.g. IAB Design Award 2023"
                  value={entry.title}
                  onChange={(e) => setEntry(i, { title: e.target.value })}
                  className={input}
                />
              </Field>
              <Field title="Year">
                <input
                  type="number"
                  min={1950}
                  max={2100}
                  value={entry.year}
                  onChange={(e) => setEntry(i, { year: e.target.value })}
                  className={input}
                />
              </Field>
            </div>
            <textarea
              rows={2}
              maxLength={500}
              placeholder="Short description (optional)"
              value={entry.description}
              onChange={(e) => setEntry(i, { description: e.target.value })}
              className={`${input} mt-3`}
            />
          </div>
        ))}

        {form.achievements.length < 15 && (
          <button
            type="button"
            onClick={() => patch({ achievements: [...form.achievements, { ...emptyAchievement }] })}
            className={addButton}
          >
            + Add Achievement
          </button>
        )}
      </div>
    </div>
  );
}
