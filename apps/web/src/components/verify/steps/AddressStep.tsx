"use client";

import { AlertTriangle, Check } from "lucide-react";
import {
  BD_DISTRICTS,
  BD_DIVISIONS,
  districtForPostcode,
  isPostcodeShape,
  postcodeFitsDistrict,
  type BdDivision,
} from "@buildora/shared";
import { Field, GlassCard, StepHeader, input } from "../ui";
import type { StepProps, WizardForm } from "../form";

/**
 * Where the applicant lives, and where they're registered.
 *
 * Two addresses because they're genuinely different facts. The **permanent**
 * one is the district the NID was issued against — people register in the
 * district they're from and then move to Dhaka for work — and it's the one the
 * postcode cross-check runs on. The **current** one is where post actually
 * reaches them.
 *
 * The division and district are picked from a list rather than typed. That's
 * the whole reason the postcode can be checked at all: a four-digit number
 * means nothing on its own, but "1230 in Dhaka" can be looked up against the
 * block Bangladesh Post assigns to that district. Free-text districts would
 * make the check impossible to run and impossible to trust.
 */

/** One address: street line, division, district, postcode. */
function AddressFields({
  prefix,
  title,
  subtitle,
  required,
  form,
  patch,
}: {
  /** "permanent" or "current" — the form keys are built from this. */
  prefix: "permanent" | "current";
  title: string;
  subtitle: string;
  required?: boolean;
  form: WizardForm;
  patch: (partial: Partial<WizardForm>) => void;
}) {
  const addressKey = `${prefix}Address` as const;
  const divisionKey = `${prefix}Division` as const;
  const districtKey = `${prefix}District` as const;
  const postcodeKey = `${prefix}Postcode` as const;

  const division = form[divisionKey];
  const district = form[districtKey];
  const postcode = form[postcodeKey];

  // Districts narrow to the chosen division; nothing is offered until one is
  // picked, which is what stops a mismatched pair being submitted at all.
  const districts = division ? (BD_DISTRICTS[division as BdDivision] ?? []) : [];

  // Live feedback on the postcode. `undefined` means there's nothing to compare
  // yet — no postcode, or no district — and says nothing rather than warning.
  const fits = postcodeFitsDistrict(postcode, district);
  const suggestion = fits === false ? districtForPostcode(postcode) : undefined;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-bold text-stone-900 dark:text-white">{title}</h3>
        <p className="mt-0.5 text-sm text-stone-600 dark:text-slate-400">{subtitle}</p>
      </div>

      <Field
        id={`${prefix}-address`}
        title="Street address"
        required={required}
        hint="House and road, area — the part that isn't the district."
      >
        <textarea
          id={`${prefix}-address`}
          rows={2}
          value={form[addressKey]}
          onChange={(e) => patch({ [addressKey]: e.target.value } as Partial<WizardForm>)}
          className={input}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field id={`${prefix}-division`} title="Division" required={required}>
          <select
            id={`${prefix}-division`}
            value={division}
            onChange={(e) =>
              // Changing the division clears the district: the old one almost
              // certainly isn't in the new division, and leaving it would make
              // the saved pair invalid.
              patch({
                [divisionKey]: e.target.value,
                [districtKey]: "",
              } as Partial<WizardForm>)
            }
            className={input}
          >
            <option value="">Select division</option>
            {BD_DIVISIONS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </Field>

        <Field id={`${prefix}-district`} title="District" required={required}>
          <select
            id={`${prefix}-district`}
            value={district}
            disabled={!division}
            onChange={(e) => patch({ [districtKey]: e.target.value } as Partial<WizardForm>)}
            className={input}
          >
            <option value="">{division ? "Select district" : "Pick a division first"}</option>
            {districts.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </Field>

        <Field id={`${prefix}-postcode`} title="Postcode" required={required}>
          <input
            id={`${prefix}-postcode`}
            type="text"
            inputMode="numeric"
            maxLength={4}
            placeholder="1230"
            value={postcode}
            onChange={(e) =>
              patch({
                [postcodeKey]: e.target.value.replace(/\D/g, "").slice(0, 4),
              } as Partial<WizardForm>)
            }
            className={input}
          />
        </Field>
      </div>

      {postcode !== "" && !isPostcodeShape(postcode) && (
        <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5" /> A Bangladeshi postcode is four digits.
        </p>
      )}
      {fits === true && (
        <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
          <Check className="h-3.5 w-3.5" /> That postcode is in {district}.
        </p>
      )}
      {fits === false && (
        <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5" />
          {suggestion
            ? `${postcode} is a ${suggestion} postcode, not ${district}.`
            : `${postcode} isn't in ${district}'s postcode range.`}
        </p>
      )}
    </div>
  );
}

export default function AddressStep({ form, patch }: StepProps) {
  // Ticking "same as permanent" copies the four values across once. It's a
  // copy rather than a live link, so the two can be edited apart again
  // afterwards without the checkbox fighting the user.
  const sameAsPermanent =
    form.currentAddress === form.permanentAddress &&
    form.currentDivision === form.permanentDivision &&
    form.currentDistrict === form.permanentDistrict &&
    form.currentPostcode === form.permanentPostcode &&
    form.permanentAddress !== "";

  return (
    <GlassCard>
      <StepHeader
        title="Address"
        subtitle="Where you're registered and where you live now. The permanent address is the one your NID was issued against."
      />

      <div className="space-y-8">
        <AddressFields
          prefix="permanent"
          title="Permanent address"
          subtitle="As printed on the back of your NID card."
          required
          form={form}
          patch={patch}
        />

        <div className="border-t border-white/50 pt-8 dark:border-white/[0.12]">
          <label className="mb-4 flex cursor-pointer items-center gap-2.5 text-sm font-semibold text-stone-800 dark:text-slate-200">
            <input
              type="checkbox"
              checked={sameAsPermanent}
              onChange={(e) =>
                patch(
                  e.target.checked
                    ? {
                        currentAddress: form.permanentAddress,
                        currentDivision: form.permanentDivision,
                        currentDistrict: form.permanentDistrict,
                        currentPostcode: form.permanentPostcode,
                      }
                    : {
                        currentAddress: "",
                        currentDivision: "",
                        currentDistrict: "",
                        currentPostcode: "",
                      }
                )
              }
              className="h-4 w-4 rounded border-white/60 accent-[#F5B400] dark:border-white/30"
            />
            I live at my permanent address
          </label>

          <AddressFields
            prefix="current"
            title="Current address"
            subtitle="Where post reaches you today, if it's somewhere else."
            form={form}
            patch={patch}
          />
        </div>
      </div>
    </GlassCard>
  );
}
