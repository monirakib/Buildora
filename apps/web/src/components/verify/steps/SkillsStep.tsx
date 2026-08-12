"use client";

import { SKILL_LEVELS, skillOptionsFor, type SkillLevel } from "@buildora/shared";
import { StepHeader } from "../ui";
import { stepCopy } from "../roles";
import type { StepProps } from "../form";

const LEVEL_LABELS: Record<SkillLevel, string> = {
  BEGINNER: "Beginner",
  INTERMEDIATE: "Intermediate",
  ADVANCED: "Advanced",
  EXPERT: "Expert",
};

/**
 * One card per tool; pick a proficiency, click again to unselect. The tools
 * offered are the role's own — an engineer models in ETABS, a contractor plans
 * in Primavera.
 */
export function SkillsStep({ form, patch, role }: StepProps) {
  const copy = stepCopy("skills", role);
  const tools = skillOptionsFor(role);

  function setLevel(name: string, level: SkillLevel) {
    const existing = form.skills.find((s) => s.name === name);
    if (existing?.level === level) {
      // Clicking the already-selected level removes the skill.
      patch({ skills: form.skills.filter((s) => s.name !== name) });
    } else if (existing) {
      patch({ skills: form.skills.map((s) => (s.name === name ? { ...s, level } : s)) });
    } else {
      patch({ skills: [...form.skills, { name, level }] });
    }
  }

  return (
    <div>
      <StepHeader title={copy.title} subtitle={copy.subtitle} />

      <div className="grid gap-3 sm:grid-cols-2">
        {tools.map((tool) => {
          const selected = form.skills.find((s) => s.name === tool);
          return (
            <div
              key={tool}
              className={`rounded-2xl border p-4 backdrop-blur-xl transition ${
                selected
                  ? "border-[#F5B400]/50 bg-[#F5B400]/[0.10] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
                  : "border-white/50 dark:border-white/[0.14] bg-white/40 dark:bg-white/[0.06] shadow-[inset_0_1px_0_rgba(255,255,255,0.10)]"
              }`}
            >
              <p className="text-sm font-bold text-stone-900 dark:text-slate-100">{tool}</p>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {SKILL_LEVELS.map((level) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => setLevel(tool, level)}
                    aria-pressed={selected?.level === level}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition ${
                      selected?.level === level
                        ? "bg-[#F5B400] text-slate-950 shadow-[0_2px_12px_rgba(245,180,0,0.35)]"
                        : "bg-white/50 dark:bg-white/10 text-stone-700 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-white/[0.16] hover:text-stone-950 dark:hover:text-white"
                    }`}
                  >
                    {LEVEL_LABELS[level]}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
