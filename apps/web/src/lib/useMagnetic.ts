"use client";

import { useRef } from "react";
import { gsap, prefersReducedMotion, useGSAP } from "@/lib/gsap";

/**
 * A button that leans toward the cursor as it approaches.
 *
 * Within `radius` pixels of the element's centre, the element translates a
 * fraction (`strength`) of the cursor's offset, and springs back to rest when
 * the cursor leaves. Restricted to fine pointers: on touch there is no
 * approach to respond to, and the hover gating rule applies.
 *
 * Only for the one or two most important buttons on a screen. A page where
 * everything leans toward you feels like a fairground, not a studio. A radius
 * of zero switches it off entirely, which is how <Button> opts out.
 */
export function useMagnetic<T extends HTMLElement>({
  radius = 90,
  strength = 0.35,
}: { radius?: number; strength?: number } = {}) {
  const ref = useRef<T>(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el || radius <= 0 || prefersReducedMotion()) return;
      if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

      const toX = gsap.quickTo(el, "x", { duration: 0.4, ease: "power3.out" });
      const toY = gsap.quickTo(el, "y", { duration: 0.4, ease: "power3.out" });

      function onMove(e: PointerEvent) {
        if (!el) return;
        const r = el.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        if (Math.hypot(dx, dy) > radius) {
          toX(0);
          toY(0);
          return;
        }
        toX(dx * strength);
        toY(dy * strength);
      }
      function onLeave() {
        toX(0);
        toY(0);
      }

      window.addEventListener("pointermove", onMove, { passive: true });
      el.addEventListener("pointerleave", onLeave);
      return () => {
        window.removeEventListener("pointermove", onMove);
        el.removeEventListener("pointerleave", onLeave);
      };
    },
    { dependencies: [radius, strength] }
  );

  return ref;
}
