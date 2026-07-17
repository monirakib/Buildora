"use client";

import { useEffect, useState } from "react";
import { motion, useMotionValue, useSpring } from "motion/react";
import { useTheme } from "@/store/useTheme";

/**
 * A soft light that trails the cursor across the whole site — like a light
 * source gliding over glass (same effect as the verification wizard's).
 * The raw pointer position feeds two motion values; useSpring smooths them
 * so the glow eases in behind the cursor.
 *
 * Night-mode only: on the light theme the effect would only muddy the page,
 * so it renders nothing there. Mounted once in the root layout as the topmost
 * fixed layer (z-60, above the z-50 navbar) so it stays visible no matter
 * what backgrounds a page paints — but pointer-events-none and ~5% alpha,
 * so it never blocks clicks or obscures content; it just reads as light
 * passing over the glass.
 */
export function CursorGlow() {
  const night = useTheme((s) => s.mode) === "night";

  // The server always renders "day" (no glow); gate on mount so the first
  // client render matches the server HTML and hydration stays clean.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Start far off-screen so the glow doesn't flash at (0,0) before the
  // first pointer event arrives.
  const x = useMotionValue(-1000);
  const y = useMotionValue(-1000);
  const springX = useSpring(x, { stiffness: 90, damping: 24, mass: 0.6 });
  const springY = useSpring(y, { stiffness: 90, damping: 24, mass: 0.6 });

  useEffect(() => {
    if (!night) return;
    function onMove(e: PointerEvent) {
      x.set(e.clientX);
      y.set(e.clientY);
    }
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [night, x, y]);

  if (!mounted || !night) return null;

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none fixed z-60 h-176 w-176 rounded-full"
      style={{
        left: springX,
        top: springY,
        translateX: "-50%",
        translateY: "-50%",
        background:
          "radial-gradient(closest-side, rgba(255,255,255,0.055), rgba(245,180,0,0.04) 45%, transparent 70%)",
      }}
    />
  );
}
