"use client";

import { useEffect } from "react";
import { motion, useMotionValue, useSpring } from "motion/react";
import { useTheme } from "@/store/useTheme";

/**
 * A soft light that trails the cursor across the whole page — like a light
 * source moving over the glass. The raw pointer position feeds two motion
 * values; useSpring smooths them so the glow glides behind the cursor.
 */
function CursorGlow() {
  const x = useMotionValue(-1000);
  const y = useMotionValue(-1000);
  const springX = useSpring(x, { stiffness: 90, damping: 24, mass: 0.6 });
  const springY = useSpring(y, { stiffness: 90, damping: 24, mass: 0.6 });

  useEffect(() => {
    function onMove(e: PointerEvent) {
      x.set(e.clientX);
      y.set(e.clientY);
    }
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [x, y]);

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none fixed z-0 h-[44rem] w-[44rem] rounded-full"
      style={{
        left: springX,
        top: springY,
        translateX: "-50%",
        translateY: "-50%",
        background:
          "radial-gradient(closest-side, rgba(255,255,255,0.05), rgba(245,180,0,0.03) 45%, transparent 70%)",
      }}
    />
  );
}

/**
 * The wizard's backdrop: an architecture photograph the glass panels actually
 * frost — the night render in dark mode, the daylight one in light mode — a
 * scrim so text stays readable, and the cursor glow. Liquid glass only reads
 * as glass when there's imagery behind it to blur.
 */
export function WizardBackground() {
  const night = useTheme((s) => s.mode) === "night";

  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden">
      {/* The photograph — keyed by theme so it cross-fades on toggle, with a
          slow drifting zoom so the scene feels alive. */}
      <motion.img
        key={night ? "night" : "day"}
        src={night ? "/verify-bg-night.jpg" : "/verify-bg-day.jpg"}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, scale: [1.05, 1.12, 1.05] }}
        transition={{
          opacity: { duration: 0.6 },
          scale: { duration: 60, repeat: Infinity, ease: "easeInOut" },
        }}
      />

      {/* Scrim: darkest/brightest at the edges, lighter in the middle, so the
          photo glows through the glass but text everywhere stays readable. */}
      <div className="absolute inset-0 bg-gradient-to-b from-white/75 via-white/40 to-white/75 dark:from-[#05070C]/85 dark:via-[#05070C]/55 dark:to-[#05070C]/85" />
      <div
        className="absolute inset-0 hidden dark:block"
        style={{
          background:
            "radial-gradient(90rem 60rem at 50% 40%, transparent, rgba(5,7,12,0.55) 75%)",
        }}
      />
      <div
        className="absolute inset-0 dark:hidden"
        style={{
          background:
            "radial-gradient(90rem 60rem at 50% 40%, transparent, rgba(255,255,255,0.5) 75%)",
        }}
      />

      {/* Fine film grain so the frost has texture */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />

      {/* The cursor light is a night-only effect — daylight needs none. */}
      {night && <CursorGlow />}
    </div>
  );
}
