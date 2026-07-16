"use client";

import { X } from "lucide-react";
import { Field, StepHeader, addButton, entryBox, input, removeButton } from "../ui";
import { UploadZone } from "../UploadZone";
import { emptyProject, type StepProps } from "../form";

const BUILDING_TYPES = [
  "Residential",
  "Commercial",
  "Industrial",
  "Hospital",
  "Educational",
  "Mixed Use",
  "High Rise",
  "Hospitality",
  "Interior",
  "Other",
];

/** Step 8 — showcase projects; at least one with a photo is required. */
export function PortfolioStep({ form, patch, onError }: StepProps) {
  const setEntry = (i: number, changes: Partial<(typeof form.portfolio)[number]>) =>
    patch({ portfolio: form.portfolio.map((p, j) => (j === i ? { ...p, ...changes } : p)) });
  const remove = (i: number) => patch({ portfolio: form.portfolio.filter((_, j) => j !== i) });

  return (
    <div>
      <StepHeader
        title="Portfolio"
        subtitle="Your best built work — the first photo of each project becomes its cover."
      />

      <div className="flex flex-col gap-4">
        {form.portfolio.map((project, i) => (
          <div key={i} className={entryBox}>
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-bold text-stone-800 dark:text-slate-200">Project {i + 1}</p>
              <button type="button" onClick={() => remove(i)} className={removeButton}>
                Remove
              </button>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field title="Project Name" required>
                <input
                  type="text"
                  required
                  value={project.title}
                  onChange={(e) => setEntry(i, { title: e.target.value })}
                  className={input}
                />
              </Field>
              <Field title="Location">
                <input
                  type="text"
                  placeholder="e.g. Dhanmondi, Dhaka"
                  value={project.location}
                  onChange={(e) => setEntry(i, { location: e.target.value })}
                  className={input}
                />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field title="Completion Year">
                  <input
                    type="number"
                    min={1950}
                    max={2100}
                    value={project.year}
                    onChange={(e) => setEntry(i, { year: e.target.value })}
                    className={input}
                  />
                </Field>
                <Field title="Building Type">
                  <select
                    value={project.buildingType}
                    onChange={(e) => setEntry(i, { buildingType: e.target.value })}
                    className={input}
                  >
                    <option value="">Select…</option>
                    {BUILDING_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field title="Client">
                <input
                  type="text"
                  value={project.client}
                  onChange={(e) => setEntry(i, { client: e.target.value })}
                  className={input}
                />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field title="Area (sqft)">
                  <input
                    type="number"
                    min={0}
                    value={project.areaSqft}
                    onChange={(e) => setEntry(i, { areaSqft: e.target.value })}
                    className={input}
                  />
                </Field>
                <Field title="Budget (BDT)">
                  <input
                    type="number"
                    min={0}
                    value={project.budgetBdt}
                    onChange={(e) => setEntry(i, { budgetBdt: e.target.value })}
                    className={input}
                  />
                </Field>
              </div>
              <Field title="Your Role">
                <input
                  type="text"
                  placeholder="e.g. Lead Architect"
                  value={project.role}
                  onChange={(e) => setEntry(i, { role: e.target.value })}
                  className={input}
                />
              </Field>
            </div>

            <textarea
              rows={3}
              maxLength={1000}
              placeholder="What was the brief, and what did you design?"
              value={project.description}
              onChange={(e) => setEntry(i, { description: e.target.value })}
              className={`${input} mt-4`}
            />

            {/* Gallery — first image is the cover */}
            <div className="mt-4">
              <p className="mb-2 text-sm font-semibold text-stone-800 dark:text-slate-200">
                Gallery{" "}
                <span className="font-normal text-stone-500 dark:text-slate-500">
                  ({project.imageUrls.length}/8 — first photo is the cover)
                </span>
              </p>
              <div className="flex flex-wrap items-start gap-3">
                {project.imageUrls.map((url, k) => (
                  <div key={url} className="group relative">
                    {/* eslint-disable-next-line @next/next/no-img-element -- Cloudinary-hosted */}
                    <img
                      src={url}
                      alt=""
                      className="h-24 w-24 rounded-xl border border-white/40 dark:border-white/10 object-cover"
                    />
                    {k === 0 && (
                      <span className="absolute bottom-1 left-1 rounded-full bg-[#F5B400] px-1.5 py-0.5 text-[9px] font-bold text-slate-950">
                        COVER
                      </span>
                    )}
                    <button
                      type="button"
                      aria-label="Remove image"
                      onClick={() =>
                        setEntry(i, { imageUrls: project.imageUrls.filter((u) => u !== url) })
                      }
                      className="absolute -top-1.5 -right-1.5 grid h-5 w-5 place-items-center rounded-full bg-slate-900 text-stone-900 dark:text-white opacity-0 shadow transition group-hover:opacity-100"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                {project.imageUrls.length < 8 && (
                  <div className="w-36">
                    {/* value is always "" so the zone stays in add mode; each
                        upload appends to the gallery. */}
                    <UploadZone
                      title="Add Photo"
                      compact
                      value=""
                      onChange={(url) =>
                        setEntry(i, { imageUrls: [...project.imageUrls, url] })
                      }
                      onError={onError}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}

        {form.portfolio.length < 12 && (
          <button
            type="button"
            onClick={() => patch({ portfolio: [...form.portfolio, { ...emptyProject }] })}
            className={addButton}
          >
            + Add Project
          </button>
        )}
      </div>
    </div>
  );
}
