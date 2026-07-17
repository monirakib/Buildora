"use client";

import { motion } from "motion/react";
import { useTheme } from "@/store/useTheme";

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

      {/* The cursor light (night-only) is global now — see components/CursorGlow. */}
    </div>
  );
}
