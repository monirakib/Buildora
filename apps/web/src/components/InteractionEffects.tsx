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
    // Pointer events arrive faster than frames are painted. The latest one is
    // kept and applied once per animation frame, so a glass card (which has
    // to re-blur whatever is behind it on every repaint) is repainted at most
    // sixty times a second, not on every wiggle of the mouse.
    let pending: { target: HTMLElement; x: number; y: number } | null = null;
    let frame = 0;

    function apply() {
      frame = 0;
      if (!pending) return;
      const { target, x, y } = pending;
      pending = null;
      const rect = target.getBoundingClientRect();
      target.style.setProperty("--mx", `${x - rect.left}px`);
      target.style.setProperty("--my", `${y - rect.top}px`);
    }

    function onMove(e: PointerEvent) {
      const target = (e.target as Element | null)?.closest?.(".spotlight");
      if (!(target instanceof HTMLElement)) return;
      pending = { target, x: e.clientX, y: e.clientY };
      if (!frame) frame = requestAnimationFrame(apply);
    }

    document.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      document.removeEventListener("pointermove", onMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
