"use client";

import { useRef } from "react";
import { gsap, prefersReducedMotion, useGSAP } from "@/lib/gsap";

/**
 * Gives a button a springy hover/press feel: it grows a little under the
 * cursor and presses in when clicked.
 *
 * Returns a ref to attach to the element. `overwrite: "auto"` matters here —
 * without it, a quick hover-out mid-grow would leave two tweens fighting over
 * the same scale.
 *
 * Usage:
 *   const ref = useHoverScale<HTMLButtonElement>({ enabled: !disabled });
 *   <button ref={ref}>…</button>
 */
export function useHoverScale<T extends HTMLElement>({
  hover = 1.04,
  tap = 0.96,
  enabled = true,
}: { hover?: number; tap?: number; enabled?: boolean } = {}) {
  const ref = useRef<T>(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;

      // Disabled buttons shouldn't react, and neither should we animate for
      // anyone who's asked for reduced motion.
      if (!enabled || prefersReducedMotion()) {
        gsap.set(el, { scale: 1 });
        return;
      }

      const to = (scale: number) =>
        gsap.to(el, { scale, duration: 0.25, ease: "power3.out", overwrite: "auto" });

      const onEnter = () => to(hover);
      const onLeave = () => to(1);
      const onDown = () => to(tap);
      const onUp = () => to(hover);

      el.addEventListener("pointerenter", onEnter);
      el.addEventListener("pointerleave", onLeave);
      el.addEventListener("pointerdown", onDown);
      el.addEventListener("pointerup", onUp);

      return () => {
        el.removeEventListener("pointerenter", onEnter);
        el.removeEventListener("pointerleave", onLeave);
        el.removeEventListener("pointerdown", onDown);
        el.removeEventListener("pointerup", onUp);
      };
    },
    { dependencies: [hover, tap, enabled] }
  );

  return ref;
}
