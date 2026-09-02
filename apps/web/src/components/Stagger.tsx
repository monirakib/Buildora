"use client";

import { useRef } from "react";
import { ENTER_START, gsap, prefersReducedMotion, useGSAP } from "@/lib/gsap";

/**
 * Animates a group of sibling elements in one after another.
 *
 * Point it at a list or a card grid and every direct child rises into place
 * in sequence. This is GSAP's `stagger` doing the work: one tween targets all
 * the children, and GSAP offsets each one's start by `stagger` seconds — far
 * less code than giving every card its own delay.
 *
 * `dependencies` matters for data-driven pages: pass the fetched array (or its
 * length) so the animation re-runs once the real rows arrive from the API.
 */
export function Stagger({
  children,
  className = "",
  stagger = 0.05,
  distance = 12,
  /** Wait for the group to scroll into view instead of playing immediately. */
  onScroll = false,
  dependencies = [],
  as: Tag = "div",
}: {
  children: React.ReactNode;
  className?: string;
  stagger?: number;
  distance?: number;
  onScroll?: boolean;
  dependencies?: unknown[];
  /** Render as a `ul`/`ol` when the children are list items, so the
   *  markup stays semantic instead of being forced into a `div`. */
  as?: "div" | "ul" | "ol";
}) {
  const ref = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;

      const items = Array.from(el.children) as HTMLElement[];
      if (items.length === 0) return;

      if (prefersReducedMotion()) {
        gsap.set(items, { opacity: 1, y: 0 });
        return;
      }

      gsap.fromTo(
        items,
        { opacity: 0, y: distance },
        {
          opacity: 1,
          y: 0,
          // 700ms was a marketing duration on a working list. With a stagger on
          // top, the last card in a six-card grid finished nearly a second
          // after the data arrived — the user is already reaching for a row
          // that is still moving. 400ms with a 50ms step lands the whole grid
          // inside 650ms and still reads as a cascade rather than a flash.
          duration: 0.4,
          ease: "power3.out",
          stagger,
          clearProps: "transform",
          scrollTrigger: onScroll ? { trigger: el, start: ENTER_START, once: true } : undefined,
        }
      );
    },
    { scope: ref, dependencies: [stagger, distance, onScroll, ...dependencies] }
  );

  return (
    <Tag
      ref={ref as React.Ref<HTMLDivElement & HTMLUListElement & HTMLOListElement>}
      className={className}
    >
      {children}
    </Tag>
  );
}
