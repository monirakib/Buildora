"use client";

import { expertiseFor } from "@buildora/shared";
import { ChipGroup, StepHeader } from "../ui";
import { stepCopy } from "../roles";
import type { StepProps } from "../form";

/**
 * Selectable chips for the work each profession takes on. The list is the
 * role's own — building types for an architect, structural work for an
 * engineer, trade packages for a contractor.
 */
export function ExpertiseStep({ form, patch, role }: StepProps) {
  const copy = stepCopy("expertise", role);

  function toggle(area: string) {
    patch({
      expertise: form.expertise.includes(area)
        ? form.expertise.filter((a) => a !== area)
        : [...form.expertise, area],
    });
  }

  return (
    <div>
      <StepHeader title={copy.title} subtitle={copy.subtitle} />

      <ChipGroup options={expertiseFor(role)} selected={form.expertise} onToggle={toggle} />

      <p className="mt-4 text-xs text-stone-500 dark:text-slate-500">
        {form.expertise.length} selected
      </p>
    </div>
  );
}
