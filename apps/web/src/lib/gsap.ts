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

/** True when the visitor has asked their OS to keep animation to a minimum. */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Where a scroll-triggered entrance should fire: when the element's top has
 * risen to 85% of the way down the viewport — i.e. just as it comes into view.
 */
export const ENTER_START = "top 85%";

export { gsap, useGSAP, ScrollTrigger };
