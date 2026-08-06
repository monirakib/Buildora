"use client";

import { useRef } from "react";
import { ENTER_START, gsap, prefersReducedMotion, useGSAP } from "@/lib/gsap";

type Direction = "up" | "down" | "left" | "right" | "none";

/** Turns a direction into the x/y offset the element animates *from*. */
function offsetFor(direction: Direction, distance: number) {
  switch (direction) {
    case "up":
      return { y: distance, x: 0 };
    case "down":
      return { y: -distance, x: 0 };
    case "left":
      return { x: distance, y: 0 };
    case "right":
      return { x: -distance, y: 0 };
    default:
      return { x: 0, y: 0 };
  }
}

/**
 * Fades and slides children into place the first time they scroll into view.
 *
 * GSAP's ScrollTrigger watches the wrapper and plays the tween once ("once:
 * true", so it never replays on the way back up). `delay` is in milliseconds
 * to stagger siblings; `direction` and `distance` shape where it travels from.
 */
export function Reveal({
  children,
  delay = 0,
  className = "",
  direction = "up",
  distance = 28,
  scale = 1,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  direction?: Direction;
  distance?: number;
  /** Start scale — e.g. 0.96 to have the element grow slightly into place. */
  scale?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;

      // Respect the OS "reduce motion" setting: show the content, skip the move.
      if (prefersReducedMotion()) {
        gsap.set(el, { opacity: 1, x: 0, y: 0, scale: 1 });
        return;
      }

      const { x, y } = offsetFor(direction, distance);

      gsap.fromTo(
        el,
        { opacity: 0, x, y, scale },
        {
          opacity: 1,
          x: 0,
          y: 0,
          scale: 1,
          duration: 1,
          delay: delay / 1000, // callers pass milliseconds
          ease: "power3.out",
          scrollTrigger: { trigger: el, start: ENTER_START, once: true },
          // Drop the inline transform afterwards so it can't create a
          // containing block for any `position: fixed` child.
          clearProps: "transform",
        }
      );
    },
    { scope: ref, dependencies: [delay, direction, distance, scale] }
  );

  // Starts invisible in the server-rendered HTML so there's no flash of
  // un-animated content before GSAP takes over on the client.
  return (
    <div ref={ref} style={{ opacity: 0 }} className={className}>
      {children}
    </div>
  );
}
