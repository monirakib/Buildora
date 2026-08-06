"use client";

import { useRef } from "react";
import { gsap, prefersReducedMotion, useGSAP } from "@/lib/gsap";

/**
 * Counts a number up from 0 the first time it scrolls into view.
 *
 * GSAP tweens a plain `{ value: 0 }` object rather than React state — on each
 * frame we write the rounded number straight into the span. That keeps the
 * count off React's render path entirely, so a page full of these stays smooth.
 */
export function CountUp({
  to,
  prefix = "",
  suffix = "",
  duration = 1800,
}: {
  to: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const numberRef = useRef<HTMLSpanElement>(null);

  useGSAP(
    () => {
      const el = ref.current;
      const target = numberRef.current;
      if (!el || !target) return;

      if (prefersReducedMotion()) {
        target.textContent = String(to);
        return;
      }

      const counter = { value: 0 };

      gsap.to(counter, {
        value: to,
        duration: duration / 1000,
        // Sprints ahead then eases into the final number — reads as "settling".
        ease: "power2.out",
        // Land on whole numbers only, so it never shows a fraction mid-count.
        snap: { value: 1 },
        onUpdate: () => {
          target.textContent = String(Math.round(counter.value));
        },
        scrollTrigger: { trigger: el, start: "top 88%", once: true },
      });
    },
    { scope: ref, dependencies: [to, duration] }
  );

  return (
    <span ref={ref}>
      {prefix}
      <span ref={numberRef}>0</span>
      {suffix}
    </span>
  );
}
