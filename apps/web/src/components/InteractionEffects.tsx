"use client";

import { useEffect } from "react";

/**
 * One document-level pointer listener that feeds every `.spotlight` card its
 * cursor position, as `--mx`/`--my` custom properties. The CSS in globals.css
 * turns those into a soft light that follows the pointer across the card.
 *
 * Delegated rather than per-card so a page with sixty cards has one listener,
 * not sixty, and cards that mount later need no setup of their own.
 */
export function InteractionEffects() {
  useEffect(() => {
    function onMove(e: PointerEvent) {
      const target = (e.target as Element | null)?.closest?.(".spotlight");
      if (!(target instanceof HTMLElement)) return;
      const rect = target.getBoundingClientRect();
      target.style.setProperty("--mx", `${e.clientX - rect.left}px`);
      target.style.setProperty("--my", `${e.clientY - rect.top}px`);
    }
    document.addEventListener("pointermove", onMove, { passive: true });
    return () => document.removeEventListener("pointermove", onMove);
  }, []);

  return null;
}
