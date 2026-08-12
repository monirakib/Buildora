"use client";

import { BD_DISTRICTS, BD_DIVISIONS, UserRole, type BdDivision } from "@buildora/shared";
import { Field, StepHeader, input } from "../ui";
import { stepCopy } from "../roles";
import type { StepProps } from "../form";

/** Districts of the chosen division, or none until one is picked. */
function districtsFor(division: string): readonly string[] {
  return BD_DISTRICTS[division as BdDivision] ?? [];
}

/** Practice details: title, firm, experience, summary, links. */
export function ProfessionalStep({ form, patch, role }: StepProps) {
  const copy = stepCopy("professional", role);
  // Contractors and suppliers trade as a business, so the firm name is always
  // asked for and there's no "I practise independently" escape hatch.
  const isBusiness = role === UserRole.CONTRACTOR || role === UserRole.SUPPLIER;

  return (
    <div>
      <StepHeader title={copy.title} subtitle={copy.subtitle} />

      <div className="flex flex-col gap-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="professionalTitle" title={isBusiness ? "Your role" : "Professional Title"}>
            <input
              id="professionalTitle"
              type="text"
              placeholder={
                role === UserRole.STRUCTURAL_ENGINEER
                  ? "e.g. Senior Structural Engineer"
                  : isBusiness
                    ? "e.g. Managing Director"
                    : "e.g. Principal Architect"
              }
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

        {!isBusiness && (
          <label className="flex items-center gap-2.5 text-sm font-semibold text-stone-800 dark:text-slate-200">
            <input
              type="checkbox"
              checked={form.isIndependent}
              onChange={(e) => patch({ isIndependent: e.target.checked })}
              className="h-4 w-4 accent-[#F5B400]"
            />
            {role === UserRole.STRUCTURAL_ENGINEER
              ? "I practise as an independent consultant"
              : "I practise as an independent architect"}
          </label>
        )}

        {(isBusiness || !form.isIndependent) && (
          <Field
            id="company"
            title={
              role === UserRole.CONTRACTOR
                ? "Firm name"
                : role === UserRole.SUPPLIER
                  ? "Business name"
                  : "Company / Firm"
            }
            required={isBusiness}
            hint={isBusiness ? "Exactly as it reads on your trade licence." : undefined}
          >
            <input
              id="company"
              type="text"
              value={form.company}
              onChange={(e) => patch({ company: e.target.value })}
              className={input}
            />
          </Field>
        )}

        <Field id="officeAddress" title={isBusiness ? "Office address" : "Office Address"}>
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
            title={isBusiness ? "Operating Division" : "Practice Division"}
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
          <Field
            id="practiceDistrict"
            title={isBusiness ? "Operating District" : "Practice District"}
          >
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
          title={isBusiness ? "About the business" : "About Yourself"}
          hint="Shown as the About section on your public profile."
        >
          <textarea
            id="bio"
            rows={4}
            maxLength={1000}
            placeholder={
              role === UserRole.STRUCTURAL_ENGINEER
                ? "Your practice, the structures you specialise in, notable work…"
                : role === UserRole.CONTRACTOR
                  ? "What your firm builds, how you're organised, notable builds…"
                  : role === UserRole.SUPPLIER
                    ? "What you stock, which brands you carry, how fast you deliver…"
                    : "Your practice, design philosophy, notable work…"
            }
            value={form.bio}
            onChange={(e) => patch({ bio: e.target.value })}
            className={input}
          />
        </Field>

        <Field
          id="portfolioTitle"
          title="Public Headline"
          hint="The big statement land owners see first on your public page."
        >
          <input
            id="portfolioTitle"
            type="text"
            maxLength={90}
            placeholder={
              role === UserRole.STRUCTURAL_ENGINEER
                ? 'e.g. "Structures That Stand Up to Dhaka"'
                : role === UserRole.CONTRACTOR
                  ? 'e.g. "Built On Time, Built To Last"'
                  : role === UserRole.SUPPLIER
                    ? 'e.g. "Genuine Materials, Delivered On Site"'
                    : 'e.g. "Architecture for a Better Tomorrow"'
            }
            value={form.portfolioTitle}
            onChange={(e) => patch({ portfolioTitle: e.target.value })}
            className={input}
          />
        </Field>

        <Field
          id="portfolioIntro"
          title="Introduction"
          hint="One or two sentences under your headline — what you do and why."
        >
          <textarea
            id="portfolioIntro"
            rows={3}
            maxLength={280}
            placeholder={
              isBusiness
                ? "What we take on, and what clients can expect working with us…"
                : "I design thoughtful spaces that respond to people, place, and purpose…"
            }
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
