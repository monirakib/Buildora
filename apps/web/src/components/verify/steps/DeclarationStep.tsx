"use client";

import { ScrollText } from "lucide-react";
import { UserRole } from "@buildora/shared";
import { Field, StepHeader, input } from "../ui";
import type { StepProps } from "../form";

/**
 * Who Buildora may check this professional's credentials with. Each role
 * consents to the bodies that actually hold their records — there's no point
 * asking a supplier to consent to an IAB check.
 */
function verifierFor(role: UserRole): string {
  switch (role) {
    case UserRole.STRUCTURAL_ENGINEER:
      return "the Institution of Engineers, Bangladesh (IEB) and RAJUK";
    case UserRole.CONTRACTOR:
    case UserRole.SUPPLIER:
      return "the issuing city corporation, the NBR, and the RJSC";
    default:
      return "the Institute of Architects Bangladesh (IAB)";
  }
}

/** Legal declaration with a typed signature. */
export function DeclarationStep({ form, patch, role }: StepProps) {
  // Signing = typing your name; the signed-at date is stamped on first type
  // and cleared when the signature is emptied again.
  function setSignature(value: string) {
    patch({
      declarationSignature: value,
      declarationSignedAt: value.trim() === "" ? "" : new Date().toISOString().slice(0, 10),
    });
  }

  const checkbox = "mt-0.5 h-4 w-4 shrink-0 accent-[#F5B400]";
  const checkLabel =
    "flex items-start gap-3 text-sm font-medium text-stone-800 dark:text-slate-200";

  return (
    <div>
      <StepHeader
        title="Final Declaration"
        subtitle="Read carefully, a supervisor verifies everything you've submitted."
      />

      <div className="flex flex-col gap-4">
        <label className={checkLabel}>
          <input
            type="checkbox"
            checked={form.agreeTruth}
            onChange={(e) => patch({ agreeTruth: e.target.checked })}
            className={checkbox}
          />
          I certify that all submitted information is true and belongs to me.
        </label>
        <label className={checkLabel}>
          <input
            type="checkbox"
            checked={form.agreeBodyCheck}
            onChange={(e) => patch({ agreeBodyCheck: e.target.checked })}
            className={checkbox}
          />
          Buildora may verify my information with {verifierFor(role)}.
        </label>
        <label className={checkLabel}>
          <input
            type="checkbox"
            checked={form.agreeSuspension}
            onChange={(e) => patch({ agreeSuspension: e.target.checked })}
            className={checkbox}
          />
          I understand that false information may permanently suspend my account.
        </label>

        <div className="mt-2 grid gap-5 sm:grid-cols-2">
          <Field
            id="declarationSignature"
            title="Typed Signature"
            required
            hint="Type your full legal name."
          >
            <input
              id="declarationSignature"
              type="text"
              value={form.declarationSignature}
              onChange={(e) => setSignature(e.target.value)}
              className={`${input} font-serif text-lg italic`}
            />
          </Field>
          <Field id="declarationDate" title="Date">
            <input
              id="declarationDate"
              type="date"
              value={form.declarationSignedAt}
              disabled
              className={input}
            />
          </Field>
        </div>

        <p className="mt-2 inline-flex items-center gap-2 text-xs text-stone-500 dark:text-slate-500">
          <ScrollText className="h-4 w-4" />
          Your declaration is stored with your submission and shown to the reviewing supervisor.
        </p>
      </div>
    </div>
  );
}
