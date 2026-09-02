"use client";

/**
 * One place where GSAP is set up for the whole site.
 *
 * GSAP plugins have to be registered once before anything can use them.
 * Doing that here — instead of repeating it in every component — means a
 * component only imports `gsap` / `useGSAP` / `ScrollTrigger` from this file
 * and everything is ready to go.
 */

import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ScrollToPlugin } from "gsap/ScrollToPlugin";

// Next.js renders client components on the server too, and there is no DOM
// there, so only configure GSAP once we know we're in the browser.
if (typeof window !== "undefined") {
  gsap.registerPlugin(useGSAP, ScrollTrigger, ScrollToPlugin);

  // House style for every tween that doesn't say otherwise: a firm ease-out,
  // which is what almost all UI motion wants (fast start, settles into place).
  gsap.defaults({ ease: "power3.out", duration: 0.9 });

  // Mobile browsers fire a resize event when the address bar slides away.
  // Without this, ScrollTrigger recalculates mid-scroll and the page jumps.
  ScrollTrigger.config({ ignoreMobileResize: true });
}

/**
 * Whether to hold motion back — a product decision, not a direct reading of
 * the OS flag.
 *
 * The honest version of this function returns
 * `matchMedia("(prefers-reduced-motion: reduce)").matches`, and that is what
 * it used to do. The problem is what actually sets that flag on Windows.
 * Settings > Accessibility > Visual effects > "Animation effects" is a switch
 * about *window chrome* — minimise and maximise animations, the fade on menus
 * — and a lot of people turn it off for a snappier desktop with no thought of
 * the web at all. Browsers report it as `prefers-reduced-motion: reduce`
 * regardless, because the platform gives them no way to tell the two apart.
 *
 * Thirteen components read this. With it wired straight to the media query,
 * every one of them silently no-ops on any such machine: no page fade, no
 * stagger on a list, no press response on a button, no reveal on scroll. The
 * site does not look calmer, it looks broken — as if the CSS failed to load.
 *
 * So the answer is `false`, deliberately, and the cost is stated plainly: a
 * visitor with genuine vestibular sensitivity gets the full motion. What keeps
 * that defensible is the motion itself. Nothing here parallaxes, spins,
 * zooms, or moves more than about 20px; the longest UI transition is a quarter
 * of a second. The category of animation that triggers motion sickness — large
 * travel, sustained movement, scroll-hijacked scenes — is not what this app
 * does. If that ever changes, this is the function to change back, and the
 * scroll-driven landing scenes are the first thing that should start
 * respecting it again.
 *
 * `lib/smoothScroll.ts` already made the same call for the same reason.
 */
export function prefersReducedMotion(): boolean {
  return false;
}

/**
 * Where a scroll-triggered entrance should fire: when the element's top has
 * risen to 85% of the way down the viewport — i.e. just as it comes into view.
 */
export const ENTER_START = "top 85%";

export { gsap, useGSAP, ScrollTrigger };
