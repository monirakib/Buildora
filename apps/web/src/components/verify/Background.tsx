"use client";

import { useRef } from "react";
import { gsap, prefersReducedMotion, useGSAP } from "@/lib/gsap";
import { useTheme } from "@/store/useTheme";

/**
 * The wizard's backdrop: an architecture photograph the glass panels actually
 * frost — the night render in dark mode, the daylight one in light mode — a
 * scrim so text stays readable, and the cursor glow. Liquid glass only reads
 * as glass when there's imagery behind it to blur.
 */
export function WizardBackground() {
  const night = useTheme((s) => s.mode) === "night";
  const imgRef = useRef<HTMLImageElement>(null);

  useGSAP(
    () => {
      const img = imgRef.current;
      if (!img) return;

      if (prefersReducedMotion()) {
        gsap.set(img, { opacity: 1, scale: 1.05 });
        return;
      }

      // Cross-fade in whenever the theme (and so the photo) changes.
      gsap.fromTo(img, { opacity: 0 }, { opacity: 1, duration: 0.6, ease: "power2.out" });

      // A very slow breathing zoom so the scene feels alive rather than
      // static. `yoyo` plays it back in reverse, `repeat: -1` runs forever.
      gsap.fromTo(
        img,
        { scale: 1.05 },
        { scale: 1.12, duration: 30, ease: "sine.inOut", repeat: -1, yoyo: true }
      );
    },
    { dependencies: [night] }
  );

  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden">
      {/* The photograph — keyed by theme so it cross-fades on toggle, with a
          slow drifting zoom so the scene feels alive. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- local asset */}
      <img
        ref={imgRef}
        key={night ? "night" : "day"}
        src={night ? "/verify-bg-night.jpg" : "/verify-bg-day.jpg"}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        style={{ opacity: 0 }}
      />

      {/* Scrim: darkest/brightest at the edges, lighter in the middle, so the
          photo glows through the glass but text everywhere stays readable. */}
      <div className="absolute inset-0 bg-gradient-to-b from-white/75 via-white/40 to-white/75 dark:from-[#05070C]/85 dark:via-[#05070C]/55 dark:to-[#05070C]/85" />
      <div
        className="absolute inset-0 hidden dark:block"
        style={{
          background: "radial-gradient(90rem 60rem at 50% 40%, transparent, rgba(5,7,12,0.55) 75%)",
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
