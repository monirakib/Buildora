"use client";

import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { gsap, prefersReducedMotion, useGSAP } from "@/lib/gsap";

export interface WizardSection {
  /** Short sidebar label, e.g. "Identity". */
  label: string;
  /** True once this step's key fields are filled — the item glows gold. */
  complete: boolean;
}

/**
 * Sticky glass navigation: one row per step.
 *
 * The active highlight is a *single* pill element rather than one per row. On
 * every step change we measure the active button and GSAP-tween the pill onto
 * it, so it glides between rows instead of jumping. (The first positioning is
 * instant — there's nothing to glide from yet.)
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
  const navRef = useRef<HTMLElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  const buttonsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const placedRef = useRef(false);

  // Re-measure on resize: the nav is a column on desktop and a scrolling row
  // on mobile, so the pill's target box changes at the breakpoint.
  const [resizeTick, setResizeTick] = useState(0);
  useEffect(() => {
    const onResize = () => setResizeTick((n) => n + 1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useGSAP(
    () => {
      const button = buttonsRef.current[current];
      const pill = pillRef.current;
      if (!button || !pill) return;

      // offsetLeft/Top are measured against the nav, which is `relative`.
      const box = {
        x: button.offsetLeft,
        y: button.offsetTop,
        width: button.offsetWidth,
        height: button.offsetHeight,
      };

      // First paint (or reduced motion): drop it straight into place.
      if (!placedRef.current || prefersReducedMotion()) {
        placedRef.current = true;
        gsap.set(pill, { ...box, opacity: 1 });
        return;
      }

      gsap.to(pill, { ...box, duration: 0.45, ease: "power3.out", overwrite: true });
    },
    { dependencies: [current, sections.length, resizeTick] }
  );

  return (
    <nav
      ref={navRef}
      aria-label="Verification steps"
      className="relative flex gap-1 rounded-[24px] border border-white/60 dark:border-white/[0.16] bg-white/60 dark:bg-white/[0.09] p-2 shadow-[0_16px_50px_rgba(0,0,0,0.12),inset_0_1px_0_rgba(255,255,255,0.6)] dark:shadow-[0_16px_50px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.16)] backdrop-blur-[44px] backdrop-saturate-[1.8] lg:flex-col"
    >
      {/* The single travelling highlight. Starts invisible until measured. */}
      <span
        ref={pillRef}
        aria-hidden
        className="pointer-events-none absolute top-0 left-0 rounded-2xl border border-white/60 dark:border-white/[0.18] bg-white/70 dark:bg-white/[0.14] shadow-[0_0_24px_rgba(245,180,0,0.10),inset_0_1px_0_rgba(255,255,255,0.20)]"
        style={{ opacity: 0 }}
      />

      {sections.map((section, i) => {
        const isCurrent = i === current;
        return (
          <button
            key={section.label}
            ref={(el) => {
              buttonsRef.current[i] = el;
            }}
            type="button"
            onClick={() => onSelect(i)}
            aria-current={isCurrent ? "step" : undefined}
            className={`relative flex shrink-0 items-center gap-3 rounded-2xl px-4 py-2.5 text-left text-sm font-semibold transition-colors duration-200 ${
              isCurrent
                ? "text-stone-900 dark:text-white"
                : "text-stone-600 dark:text-slate-400 hover:text-stone-800 dark:hover:text-slate-200"
            }`}
          >
            <span
              className={`relative grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold transition-[color,background-color,border-color] duration-200 ease-out ${
                section.complete
                  ? "bg-[#F5B400] text-slate-950 shadow-[0_0_14px_rgba(245,180,0,0.5)]"
                  : isCurrent
                    ? "border border-[#F5B400]/60 text-amber-700 dark:text-[#F5B400]"
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
