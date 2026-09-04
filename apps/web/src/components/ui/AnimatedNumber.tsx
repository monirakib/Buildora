"use client";

import { useRef } from "react";
import { gsap, prefersReducedMotion, useGSAP } from "@/lib/gsap";

/**
 * A number that counts to its new value instead of snapping there.
 *
 * Used for totals that change as the user acts, such as a cart subtotal as a
 * quantity is stepped. Counting is what tells the eye "this is the same
 * figure, updated" rather than "a different figure appeared".
 */
export function AnimatedNumber({
  value,
  format = (n) => n.toLocaleString("en-IN"),
  className = "",
}: {
  value: number;
  format?: (n: number) => string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  // Where the tween last left the displayed value, so a change mid-tween
  // continues from what is on screen instead of jumping back.
  const shown = useRef(value);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      if (prefersReducedMotion() || shown.current === value) {
        shown.current = value;
        el.textContent = format(value);
        return;
      }
      const counter = { v: shown.current };
      gsap.to(counter, {
        v: value,
        duration: 0.5,
        ease: "power2.out",
        overwrite: "auto",
        onUpdate: () => {
          shown.current = counter.v;
          el.textContent = format(Math.round(counter.v));
        },
      });
    },
    { dependencies: [value] }
  );

  return (
    <span ref={ref} className={`tabular-nums ${className}`}>
      {format(value)}
    </span>
  );
}
