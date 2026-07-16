"use client";

import { motion } from "motion/react";
import { Check } from "lucide-react";

export interface WizardSection {
  /** Short sidebar label, e.g. "Identity". */
  label: string;
  /** True once this step's key fields are filled — the item glows gold. */
  complete: boolean;
}

/**
 * Sticky glass navigation: one row per step. The active highlight is a single
 * shared motion element (layoutId), so it glides between rows when the step
 * changes instead of jumping.
 */
export function SidebarNav({
  sections,
  current,
  onSelect,
}: {
  sections: WizardSection[];
  current: number;
  onSelect: (index: number) => void;
}) {
  return (
    <nav
      aria-label="Verification steps"
      className="flex gap-1 rounded-[24px] border border-white/60 dark:border-white/[0.16] bg-white/60 dark:bg-white/[0.09] p-2 shadow-[0_16px_50px_rgba(0,0,0,0.12),inset_0_1px_0_rgba(255,255,255,0.6)] dark:shadow-[0_16px_50px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.16)] backdrop-blur-[44px] backdrop-saturate-[1.8] lg:flex-col"
    >
      {sections.map((section, i) => {
        const isCurrent = i === current;
        return (
          <button
            key={section.label}
            type="button"
            onClick={() => onSelect(i)}
            aria-current={isCurrent ? "step" : undefined}
            className={`relative flex shrink-0 items-center gap-3 rounded-2xl px-4 py-2.5 text-left text-sm font-semibold transition-colors duration-200 ${
              isCurrent ? "text-stone-900 dark:text-white" : "text-stone-600 dark:text-slate-400 hover:text-stone-800 dark:hover:text-slate-200"
            }`}
          >
            {isCurrent && (
              <motion.span
                layoutId="wizard-nav-pill"
                transition={{ type: "spring", stiffness: 380, damping: 32 }}
                className="absolute inset-0 rounded-2xl border border-white/60 dark:border-white/[0.18] bg-white/70 dark:bg-white/[0.14] shadow-[0_0_24px_rgba(245,180,0,0.10),inset_0_1px_0_rgba(255,255,255,0.20)]"
              />
            )}
            <span
              className={`relative grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold transition-all duration-300 ${
                section.complete
                  ? "bg-[#F5B400] text-slate-950 shadow-[0_0_14px_rgba(245,180,0,0.5)]"
                  : isCurrent
                    ? "border border-[#F5B400]/60 text-amber-600 dark:text-[#F5B400]"
                    : "border border-stone-400/50 dark:border-white/15 text-stone-500 dark:text-slate-500"
              }`}
            >
              {section.complete ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <span className="relative">{section.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
