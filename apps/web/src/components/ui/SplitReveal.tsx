"use client";

import { useRef } from "react";
import { gsap, prefersReducedMotion, useGSAP } from "@/lib/gsap";

/**
 * A title whose words rise out of a mask, one after another.
 *
 * The signature entrance of the editorial web: each word sits inside an
 * overflow-hidden span and slides up from below its own baseline, so the
 * text appears to be printed onto the page rather than faded onto it. Words
 * rather than characters, because word-level motion reads at a glance and
 * character-level motion reads as a gimmick on a title people see daily.
 *
 * Plain-text children only. Anything with markup should use PageHeader's
 * ordinary fade instead.
 */
export function SplitReveal({
  text,
  as: Tag = "span",
  className = "",
  delay = 0,
  ...rest
}: {
  text: string;
  as?: "span" | "h1" | "h2" | "p";
  className?: string;
  delay?: number;
} & Omit<React.HTMLAttributes<HTMLElement>, "children">) {
  const ref = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el || prefersReducedMotion()) return;
      gsap.fromTo(
        el.querySelectorAll("[data-word]"),
        { yPercent: 110, opacity: 0 },
        {
          yPercent: 0,
          opacity: 1,
          duration: 0.9,
          stagger: 0.06,
          delay,
          ease: "power4.out",
          clearProps: "transform,opacity",
        }
      );
    },
    { scope: ref, dependencies: [text] }
  );

  return (
    <Tag
      ref={ref as React.Ref<HTMLHeadingElement>}
      className={className}
      aria-label={text}
      {...rest}
    >
      {text.split(/(\s+)/).map((part, i) =>
        /^\s+$/.test(part) ? (
          <span key={i} aria-hidden>
            {" "}
          </span>
        ) : (
          <span
            key={i}
            aria-hidden
            className="inline-block overflow-hidden pb-[0.08em] align-baseline"
          >
            <span data-word className="inline-block will-change-transform">
              {part}
            </span>
          </span>
        )
      )}
    </Tag>
  );
}
