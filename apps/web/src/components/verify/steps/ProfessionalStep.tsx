"use client";

import { BD_DISTRICTS, BD_DIVISIONS, type BdDivision } from "@buildora/shared";
import { Field, StepHeader, input } from "../ui";
import type { StepProps } from "../form";

/** Districts of the chosen division, or none until one is picked. */
function districtsFor(division: string): readonly string[] {
  return BD_DISTRICTS[division as BdDivision] ?? [];
}

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

        {/* Practice location — this is what land owners filter the directory
            by, so it's a fixed division/district pair rather than free text.
            Changing the division clears the district, because a district only
            belongs to one division. */}
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            id="practiceDivision"
            title="Practice Division"
            hint="Where you take on work — land owners filter by this."
          >
            <select
              id="practiceDivision"
              value={form.practiceDivision}
              onChange={(e) => patch({ practiceDivision: e.target.value, practiceDistrict: "" })}
              className={input}
            >
              <option value="">Select…</option>
              {BD_DIVISIONS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </Field>
          <Field id="practiceDistrict" title="Practice District">
            <select
              id="practiceDistrict"
              value={form.practiceDistrict}
              disabled={!form.practiceDivision}
              onChange={(e) => patch({ practiceDistrict: e.target.value })}
              className={input}
            >
              <option value="">
                {form.practiceDivision ? "Select…" : "Pick a division first"}
              </option>
              {districtsFor(form.practiceDivision).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </Field>
        </div>

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

        <Field
          id="portfolioTitle"
          title="Portfolio Headline"
          hint="The big statement land owners see first on your public portfolio."
        >
          <input
            id="portfolioTitle"
            type="text"
            maxLength={90}
            placeholder='e.g. "Architecture for a Better Tomorrow"'
            value={form.portfolioTitle}
            onChange={(e) => patch({ portfolioTitle: e.target.value })}
            className={input}
          />
        </Field>

        <Field
          id="portfolioIntro"
          title="Portfolio Introduction"
          hint="One or two sentences under your headline — what you design and why."
        >
          <textarea
            id="portfolioIntro"
            rows={3}
            maxLength={280}
            placeholder="I design thoughtful spaces that respond to people, place, and purpose…"
            value={form.portfolioIntro}
            onChange={(e) => patch({ portfolioIntro: e.target.value })}
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
