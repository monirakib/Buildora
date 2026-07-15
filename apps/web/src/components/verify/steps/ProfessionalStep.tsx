"use client";

import { Field, StepHeader, input } from "../ui";
import type { StepProps } from "../form";

/** Step 2 — practice details: title, firm, experience, summary, links. */
export function ProfessionalStep({ form, patch }: StepProps) {
  return (
    <div>
      <StepHeader
        title="Professional Information"
        subtitle="How you practise — your title, firm, and professional presence."
      />

      <div className="flex flex-col gap-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="professionalTitle" title="Professional Title">
            <input
              id="professionalTitle"
              type="text"
              placeholder="e.g. Principal Architect"
              value={form.professionalTitle}
              onChange={(e) => patch({ professionalTitle: e.target.value })}
              className={input}
            />
          </Field>
          <Field id="yearsExperience" title="Years of Experience">
            <input
              id="yearsExperience"
              type="number"
              min={0}
              max={80}
              value={form.yearsExperience}
              onChange={(e) => patch({ yearsExperience: e.target.value })}
              className={input}
            />
          </Field>
        </div>

        <label className="flex items-center gap-2.5 text-sm font-semibold text-stone-800 dark:text-slate-200">
          <input
            type="checkbox"
            checked={form.isIndependent}
            onChange={(e) => patch({ isIndependent: e.target.checked })}
            className="h-4 w-4 accent-[#F5B400]"
          />
          I practise as an independent architect
        </label>

        {!form.isIndependent && (
          <Field id="company" title="Company / Firm">
            <input
              id="company"
              type="text"
              value={form.company}
              onChange={(e) => patch({ company: e.target.value })}
              className={input}
            />
          </Field>
        )}

        <Field id="officeAddress" title="Office Address">
          <textarea
            id="officeAddress"
            rows={2}
            maxLength={300}
            value={form.officeAddress}
            onChange={(e) => patch({ officeAddress: e.target.value })}
            className={input}
          />
        </Field>

        <Field
          id="bio"
          title="About Yourself"
          hint="Shown as the About section on your public profile."
        >
          <textarea
            id="bio"
            rows={4}
            maxLength={1000}
            placeholder="Your practice, design philosophy, notable work…"
            value={form.bio}
            onChange={(e) => patch({ bio: e.target.value })}
            className={input}
          />
        </Field>

        <Field id="languages" title="Languages" hint="Comma-separated, e.g. Bangla, English">
          <input
            id="languages"
            type="text"
            value={form.languages}
            onChange={(e) => patch({ languages: e.target.value })}
            className={input}
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="website" title="Website">
            <input
              id="website"
              type="url"
              placeholder="https://…"
              value={form.website}
              onChange={(e) => patch({ website: e.target.value })}
              className={input}
            />
          </Field>
          <Field id="linkedin" title="LinkedIn">
            <input
              id="linkedin"
              type="url"
              placeholder="https://linkedin.com/in/…"
              value={form.linkedin}
              onChange={(e) => patch({ linkedin: e.target.value })}
              className={input}
            />
          </Field>
        </div>
      </div>
    </div>
  );
}
