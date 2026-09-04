"use client";

import { useRef } from "react";
import { ENTER_START, gsap, prefersReducedMotion, useGSAP } from "@/lib/gsap";

const tranches = [
  { label: "Design", share: 25, gate: "Approved drawings" },
  { label: "Structure", share: 45, gate: "Engineer-signed slab inspection" },
  { label: "Finishing", share: 30, gate: "Handover checklist" },
];

/**
 * The escrow band's one visual: three tranches filling in sequence as the
 * section scrolls into view, each labelled with the gate that releases it.
 *
 * Plays once, driven by ScrollTrigger, so it reads as the money moving when
 * the reader arrives rather than a bar that was always full.
 */
export function EscrowMeter() {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      const bars = el.querySelectorAll<HTMLElement>("[data-bar]");
      const ticks = el.querySelectorAll<HTMLElement>("[data-tick]");
      if (prefersReducedMotion()) {
        gsap.set(bars, { scaleX: 1 });
        gsap.set(ticks, { opacity: 1 });
        return;
      }
      const tl = gsap.timeline({
        scrollTrigger: { trigger: el, start: ENTER_START, once: true },
      });
      bars.forEach((bar, i) => {
        tl.fromTo(bar, { scaleX: 0 }, { scaleX: 1, duration: 0.9, ease: "power3.out" }, i * 0.35);
        tl.fromTo(
          ticks[i]!,
          { opacity: 0, scale: 0.6 },
          { opacity: 1, scale: 1, duration: 0.3 },
          i * 0.35 + 0.8
        );
      });
    },
    { scope: ref }
  );

  return (
    <div ref={ref} className="mx-auto mt-14 max-w-2xl">
      <ul className="flex flex-col gap-7">
        {tranches.map((t) => (
          <li key={t.label}>
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-bold">{t.label}</span>
              <span className="flex items-center gap-2 text-white/60">
                {t.gate}
                <span
                  data-tick
                  className="grid h-5 w-5 place-items-center rounded-full bg-emerald-500 text-white"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-3 w-3"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </span>
              </span>
            </div>
            <div className="mt-2 h-3 overflow-hidden rounded-full bg-white/10">
              <div
                data-bar
                className="h-full origin-left rounded-full bg-amber-400"
                style={{ width: `${t.share}%`, transform: "scaleX(0)" }}
              />
            </div>
            <p className="mt-1.5 text-xs text-white/40">{t.share}% of the contract sum</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
