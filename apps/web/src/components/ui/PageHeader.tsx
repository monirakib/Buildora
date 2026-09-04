"use client";

import { useRef } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { gsap, prefersReducedMotion, useGSAP } from "@/lib/gsap";
import { SplitReveal } from "./SplitReveal";

/**
 * The top of every app page: eyebrow, title, one line of context, and the
 * page's primary action on the right.
 *
 * Each line rises into place a beat after the one above it. Reading order is
 * eyebrow, title, description, action, and the stagger makes the eye follow
 * that order instead of taking the whole block in at once.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  back,
  className = "",
}: {
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  /** A small "back" link above the eyebrow, for pages one level deep. */
  back?: { href: string; label: string };
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el || prefersReducedMotion()) return;
      // A string title reveals word by word on its own; everything else fades.
      const lines = el.querySelectorAll("[data-line]:not([data-split])");
      gsap.fromTo(
        lines,
        { opacity: 0, y: 14 },
        { opacity: 1, y: 0, duration: 0.55, stagger: 0.07, ease: "power3.out", clearProps: "all" }
      );
    },
    { scope: ref }
  );

  return (
    <div ref={ref} className={`flex flex-wrap items-end justify-between gap-4 ${className}`}>
      <div className="min-w-0">
        {back && (
          <Link
            href={back.href}
            data-line
            className="link-arrow mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-stone-500 transition hover:text-amber-700 dark:text-slate-400 dark:hover:text-amber-400"
          >
            <ArrowLeft className="h-4 w-4 transition-[translate] duration-200 ease-out group-hover:-translate-x-0.5" />
            {back.label}
          </Link>
        )}
        {eyebrow && (
          <p
            data-line
            className="text-[0.7rem] font-bold tracking-[0.22em] text-stone-500 uppercase dark:text-slate-400"
          >
            {eyebrow}
          </p>
        )}
        {typeof title === "string" ? (
          <SplitReveal
            as="h1"
            text={title}
            data-split
            className="display-title mt-3 text-4xl text-stone-900 sm:text-5xl dark:text-white"
          />
        ) : (
          <h1
            data-line
            className="display-title mt-3 text-4xl text-stone-900 sm:text-5xl dark:text-white"
          >
            {title}
          </h1>
        )}
        {description && (
          <p
            data-line
            className="mt-3 max-w-xl text-lg leading-relaxed text-stone-600 dark:text-slate-400"
          >
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div data-line className="flex flex-wrap items-center gap-2">
          {actions}
        </div>
      )}
    </div>
  );
}
