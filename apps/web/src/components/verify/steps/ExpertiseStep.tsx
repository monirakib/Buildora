"use client";

import { Check } from "lucide-react";
import { EXPERTISE_AREAS } from "@buildora/shared";
import { StepHeader } from "../ui";
import type { StepProps } from "../form";

/** Step 6 — selectable chips for the building types the architect designs. */
export function ExpertiseStep({ form, patch }: StepProps) {
  function toggle(area: string) {
    const selected = form.expertise.includes(area);
    patch({
      expertise: selected
        ? form.expertise.filter((a) => a !== area)
        : [...form.expertise, area],
    });
  }

  return (
    <div>
      <StepHeader
        title="Areas of Expertise"
        subtitle="Pick every building type you have real project experience with."
      />

      <div className="flex flex-wrap gap-2.5">
        {EXPERTISE_AREAS.map((area) => {
          const selected = form.expertise.includes(area);
          return (
            <button
              key={area}
              type="button"
              onClick={() => toggle(area)}
              aria-pressed={selected}
              className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-bold transition ${
                selected
                  ? "border-[#F5B400]/70 bg-[#F5B400]/20 text-amber-600 dark:text-[#F5B400] shadow-[0_0_16px_rgba(245,180,0,0.2)] backdrop-blur-xl"
                  : "border-white/60 dark:border-white/[0.18] bg-white/50 dark:bg-white/[0.08] text-stone-800 dark:text-slate-200 backdrop-blur-xl hover:border-stone-400 dark:hover:border-white/35"
              }`}
            >
              {selected && <Check className="h-3.5 w-3.5" />}
              {area}
            </button>
          );
        })}
      </div>

      <p className="mt-4 text-xs text-stone-500 dark:text-slate-500">
        {form.expertise.length} selected
      </p>
    </div>
  );
}
