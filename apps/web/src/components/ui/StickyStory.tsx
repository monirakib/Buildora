"use client";

import { useEffect, useRef, useState } from "react";

export interface StoryStep {
  eyebrow?: string;
  title: string;
  body: string;
  /** What shows on the right while this step is in view. */
  visual: React.ReactNode;
}

/**
 * Text steps on the left scroll past a visual on the right that stays put
 * and swaps as each step arrives.
 *
 * One IntersectionObserver watches the steps; whichever crosses the middle
 * of the viewport is the active one. The visuals are all rendered and
 * crossfaded rather than mounted on demand, so a swap never waits on an
 * image. Below `lg` the layout stacks and each step carries its own visual.
 */
export function StickyStory({ steps, className = "" }: { steps: StoryStep[]; className?: string }) {
  const [active, setActive] = useState(0);
  const stepRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const i = Number((entry.target as HTMLElement).dataset.step);
          if (!Number.isNaN(i)) setActive(i);
        }
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: 0 }
    );
    stepRefs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, [steps.length]);

  return (
    <div className={`grid gap-12 lg:grid-cols-2 lg:gap-16 ${className}`}>
      <div className="flex flex-col gap-20 lg:gap-[36vh] lg:py-[18vh]">
        {steps.map((step, i) => (
          <div
            key={step.title}
            ref={(el) => {
              stepRefs.current[i] = el;
            }}
            data-step={i}
            className={`transition-opacity duration-500 ease-out ${
              active === i ? "lg:opacity-100" : "lg:opacity-35"
            }`}
          >
            {step.eyebrow && (
              <p className="text-sm font-bold tracking-[0.2em] text-amber-800 uppercase dark:text-amber-400">
                {step.eyebrow}
              </p>
            )}
            <h3 className="display-title mt-3 text-3xl sm:text-4xl">{step.title}</h3>
            <p className="mt-4 max-w-md text-lg leading-relaxed text-stone-600 dark:text-slate-400">
              {step.body}
            </p>
            {/* The visual travels with its step on small screens. */}
            <div className="mt-8 overflow-hidden rounded-3xl lg:hidden">{step.visual}</div>
          </div>
        ))}
      </div>

      {/* The pinned visual. A full-viewport sticky wrapper centres the frame,
          so it never draws above the column's top edge (a translate would,
          and would sit on top of whatever heading is above the story). The
          frame is capped at 76vh so the floating navbar clears it. */}
      <div className="hidden lg:block">
        <div className="sticky top-0 flex h-screen items-center justify-center">
          <div className="relative aspect-4/5 w-full max-w-[61vh] overflow-hidden rounded-3xl border border-white/50 bg-white/40 shadow-2xl shadow-black/10 dark:border-white/10 dark:bg-white/5">
            {steps.map((step, i) => (
              <div
                key={step.title}
                aria-hidden={active !== i}
                className={`absolute inset-0 transition-[opacity,scale] duration-700 ease-out ${
                  active === i ? "scale-100 opacity-100" : "scale-[1.03] opacity-0"
                }`}
              >
                {step.visual}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
