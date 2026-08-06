/**
 * Apple-style eased page scrolling, powered by GSAP's ScrollToPlugin.
 *
 * Native CSS `scroll-behavior: smooth` caps its animation at roughly half a
 * second regardless of distance, so multi-screen jumps (our hero alone is
 * 320vh) look like instant teleports. GSAP animates the scroll position
 * instead: the duration scales with distance and a power2.inOut curve gives
 * the slow-start / fast-middle / gentle-landing "swoop" feel.
 */

import { gsap } from "@/lib/gsap";

/**
 * Absolute page-Y of an element's top, honoring its scroll-mt-* so headings
 * clear the fixed navbar.
 */
function targetYForId(id: string): number | null {
  const el = document.getElementById(id);
  if (!el) return null;
  const margin = parseFloat(window.getComputedStyle(el).scrollMarginTop) || 0;
  const maxY = document.documentElement.scrollHeight - window.innerHeight;
  return Math.max(0, Math.min(maxY, window.scrollY + el.getBoundingClientRect().top - margin));
}

/**
 * Smoothly scrolls to the element with the given id (no leading "#").
 *
 * If we're inside the tall (320vh) scroll-scrubbed hero and the target lies
 * below it, we cut instantly to the hero's bottom first so the hero doesn't
 * replay every frame on the way down — then smooth-scroll the rest.
 */
export function smoothScrollToId(id: string) {
  const targetY = targetYForId(id);
  if (targetY == null) return;

  const hero = document.getElementById("hero");
  if (hero && id !== "hero") {
    const heroBottom = window.scrollY + hero.getBoundingClientRect().bottom - window.innerHeight;
    if (window.scrollY < heroBottom && targetY >= heroBottom) {
      window.scrollTo({ top: heroBottom, behavior: "instant" });
    }
  }

  smoothScrollTo(targetY);
  // Keep the URL hash shareable without triggering the browser's own jump.
  history.replaceState(null, "", `#${id}`);
}

export function smoothScrollTo(targetY: number) {
  const distance = Math.abs(targetY - window.scrollY);
  if (distance < 1) return;

  // Longer jumps get more airtime, capped so it never feels sluggish.
  const duration = Math.min(1.5, 0.45 + distance * 0.00022);

  // Deliberately ignores prefers-reduced-motion: OS-level "animations off"
  // (common on Windows) would otherwise turn every jump instant.
  gsap.to(window, {
    duration,
    // Slow start, fast middle, gentle landing — the nav "swoop".
    ease: "power2.inOut",
    scrollTo: {
      y: targetY,
      // Hands control straight back to the user the moment they scroll
      // themselves, which is what the old wheel/touchstart listeners did.
      autoKill: true,
    },
    // Only one page-scroll animation should ever be in flight.
    overwrite: true,
  });
}
