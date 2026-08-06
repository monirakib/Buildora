"use client";

import { useEffect, useRef, useState } from "react";
import { gsap, prefersReducedMotion, useGSAP } from "@/lib/gsap";
import { useTheme } from "@/store/useTheme";

/**
 * A soft light that trails the cursor across the whole site — like a light
 * source gliding over glass (same effect as the verification wizard's).
 *
 * The pointer position is fed to GSAP `quickTo` setters, which are pre-compiled
 * tweens built for exactly this: they get re-targeted on every pointermove and
 * ease the glow toward the cursor without allocating a new tween each time.
 *
 * Night-mode only: on the light theme the effect would only muddy the page,
 * so it renders nothing there. Mounted once in the root layout as the topmost
 * fixed layer (z-60, above the z-50 navbar) so it stays visible no matter
 * what backgrounds a page paints — but pointer-events-none and ~5% alpha,
 * so it never blocks clicks or obscures content.
 */
export function CursorGlow() {
  const night = useTheme((s) => s.mode) === "night";
  const ref = useRef<HTMLDivElement>(null);

  // The server always renders "day" (no glow); gate on mount so the first
  // client render matches the server HTML and hydration stays clean.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const active = mounted && night;

  useGSAP(
    () => {
      const el = ref.current;
      if (!el || !active || prefersReducedMotion()) return;

      // Centre the glow on the cursor, and park it far off-screen so it
      // doesn't flash at (0,0) before the first pointer event arrives.
      // (This runs before the browser paints, so nothing is ever visible there.)
      gsap.set(el, { xPercent: -50, yPercent: -50, x: -1000, y: -1000 });

      // Two eased setters — one per axis. Re-calling them just re-aims the
      // existing tween, which is far cheaper than starting a new one.
      const moveX = gsap.quickTo(el, "x", { duration: 0.7, ease: "power3.out" });
      const moveY = gsap.quickTo(el, "y", { duration: 0.7, ease: "power3.out" });

      function onMove(e: PointerEvent) {
        moveX(e.clientX);
        moveY(e.clientY);
      }

      window.addEventListener("pointermove", onMove);
      // useGSAP's cleanup runs this on unmount / when `active` flips.
      return () => window.removeEventListener("pointermove", onMove);
    },
    { dependencies: [active] }
  );

  if (!active) return null;

  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed top-0 left-0 z-60 h-176 w-176 rounded-full"
      style={{
        background:
          "radial-gradient(closest-side, rgba(255,255,255,0.055), rgba(245,180,0,0.04) 45%, transparent 70%)",
      }}
    />
  );
}
