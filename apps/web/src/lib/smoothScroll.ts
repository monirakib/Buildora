/**
 * Apple-style eased page scrolling.
 *
 * Native CSS `scroll-behavior: smooth` caps its animation at roughly half a
 * second regardless of distance, so multi-screen jumps (our hero alone is
 * 320vh) look like instant teleports. This drives window.scrollTo from a
 * requestAnimationFrame loop instead: duration scales with distance and an
 * ease-in-out curve gives the slow-start / fast-middle / gentle-landing
 * "swoop" feel.
 */

/** Cancels the in-flight scroll animation, if any. */
let cancelActive: (() => void) | null = null;

/** Ease-in-out cubic — slow start, fast middle, gentle landing (nav swoop). */
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

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
  cancelActive?.();
  const easeFn = easeInOutCubic;

  // Deliberately ignores prefers-reduced-motion: OS-level "animations off"
  // (common on Windows) would otherwise turn every jump instant.
  const startY = window.scrollY;
  const distance = targetY - startY;
  if (Math.abs(distance) < 1) return;

  // Longer jumps get more airtime, capped so it never feels sluggish.
  const duration = Math.min(1500, 450 + Math.abs(distance) * 0.22);
  const startedAt = performance.now();
  let raf = 0;

  // The user's own wheel/touch input takes over immediately.
  const stop = () => {
    cancelAnimationFrame(raf);
    window.removeEventListener("wheel", stop);
    window.removeEventListener("touchstart", stop);
    cancelActive = null;
  };
  window.addEventListener("wheel", stop, { passive: true });
  window.addEventListener("touchstart", stop, { passive: true });
  cancelActive = stop;

  const tick = (now: number) => {
    const p = Math.min(1, (now - startedAt) / duration);
    // "instant" bypasses the CSS scroll-behavior so each frame lands exactly.
    window.scrollTo({ top: startY + distance * easeFn(p), behavior: "instant" });
    if (p < 1) raf = requestAnimationFrame(tick);
    else stop();
  };
  raf = requestAnimationFrame(tick);
}
