"use client";

import { useRef } from "react";
import Link from "next/link";
import { motion, useScroll, useSpring } from "motion/react";
import { Reveal } from "./Reveal";

const steps = [
  {
    title: "Post your project brief",
    body: "Land area, location, floors, budget, and style — done in minutes.",
    meta: "Takes ~5 minutes",
  },
  {
    title: "Match with verified pros",
    body: "Browse portfolios, compare ratings, and request low-cost concept briefs.",
    meta: "NID · IAB · RAJUK checked",
  },
  {
    title: "Design & permits",
    body: "Approve designs online while your RAJUK permit is filed and tracked through ECPS.",
    meta: "ECPS tracked",
  },
  {
    title: "Build with protection",
    body: "Engineers sign off each milestone; escrow releases payments only when work is verified.",
    meta: "Escrow protected",
  },
];

/**
 * Sticky heading on the left, the four steps on the right — with an amber
 * progress line that draws itself down the track as the list scrolls through
 * the viewport (useScroll maps list position to 0→1; useSpring smooths it).
 */
export function HowItWorks() {
  const listRef = useRef<HTMLOListElement>(null);
  const { scrollYProgress } = useScroll({
    target: listRef,
    // 0 when the list's top reaches 75% down the screen, 1 when its bottom
    // passes 45% — so the line finishes just before the last step leaves.
    offset: ["start 0.75", "end 0.45"],
  });
  const scaleY = useSpring(scrollYProgress, { stiffness: 90, damping: 25 });

  return (
    <section
      id="how-it-works"
      className="border-y border-stone-200 bg-white py-24 transition-colors duration-500 sm:py-32 dark:border-white/10 dark:bg-white/3"
    >
      <div className="mx-auto grid max-w-6xl gap-14 px-5 sm:px-8 lg:grid-cols-[1fr_1.3fr]">
        {/* Sticky intro — stays put while the steps scroll past */}
        <div className="lg:sticky lg:top-32 lg:self-start">
          <Reveal>
            <p className="text-sm font-bold tracking-[0.2em] text-amber-600 uppercase dark:text-amber-400">
              How it works
            </p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-5xl">
              Four steps from
              <br />
              plot to keys
            </h2>
            <p className="mt-4 max-w-sm text-lg text-stone-600 dark:text-slate-400">
              The whole journey lives on one platform — no chasing offices, no cash handshakes.
            </p>
            <Link
              href="/architects"
              className="mt-7 inline-flex items-center gap-2 text-sm font-bold text-amber-600 transition hover:gap-3 dark:text-amber-400"
            >
              Browse verified architects
              <span aria-hidden>→</span>
            </Link>
          </Reveal>
        </div>

        {/* The steps, threaded on a progress line */}
        <ol ref={listRef} className="relative flex flex-col gap-14">
          {/* Track + the amber line that grows with scroll */}
          <span
            aria-hidden
            className="absolute top-2 bottom-2 left-6 w-px bg-stone-200 dark:bg-white/10"
          />
          <motion.span
            aria-hidden
            style={{ scaleY }}
            className="absolute top-2 bottom-2 left-6 w-px origin-top bg-amber-500 dark:bg-amber-400"
          />

          {steps.map((step, i) => (
            <Reveal key={step.title} delay={i * 90}>
              <li className="relative list-none pl-20">
                {/* Solid disc sits on top of the line */}
                <span className="absolute top-0 left-0 grid h-12 w-12 place-items-center rounded-full bg-stone-900 text-lg font-extrabold text-amber-400 dark:bg-amber-400 dark:text-slate-950">
                  {i + 1}
                </span>
                <h3 className="text-lg font-bold">{step.title}</h3>
                <p className="mt-2 max-w-md text-sm leading-relaxed text-stone-600 dark:text-slate-400">
                  {step.body}
                </p>
                <p className="mt-3 inline-block rounded-full border border-stone-200 px-3 py-1 text-xs font-bold text-stone-500 dark:border-white/10 dark:text-slate-400">
                  {step.meta}
                </p>
              </li>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}
