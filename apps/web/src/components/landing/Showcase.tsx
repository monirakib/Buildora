"use client";

import { useRef } from "react";
import Link from "next/link";
import { Reveal } from "./Reveal";

/* Photography: Unsplash / Pexels free license, stored in /public/landing. */
const showcaseCards = [
  {
    src: "/landing/modern-home.jpg",
    tag: "Residential",
    line: "Duplexes, villas, and family homes",
  },
  {
    src: "/landing/facade.jpg",
    tag: "Commercial",
    line: "Offices and mixed-use towers",
  },
  {
    src: "/landing/drafting.jpg",
    tag: "Design first",
    line: "Concept briefs before you commit",
  },
  {
    src: "/landing/interior.jpg",
    tag: "Interiors",
    line: "Fit-outs and renovations",
  },
  {
    src: "/landing/sunset-build.jpg",
    tag: "Site execution",
    line: "Milestones signed off by engineers",
  },
  {
    src: "/landing/concrete-white.jpg",
    tag: "Institutional",
    line: "Schools, clinics, and public works",
  },
];

/** Round chevron button for the gallery rail. */
function ArrowButton({ dir, onClick }: { dir: "prev" | "next"; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={dir === "prev" ? "Previous projects" : "More projects"}
      className="grid h-11 w-11 place-items-center rounded-full border border-stone-300 text-stone-700 transition hover:border-amber-500 hover:text-amber-600 dark:border-white/20 dark:text-slate-200 dark:hover:border-amber-400 dark:hover:text-amber-300"
    >
      <svg
        viewBox="0 0 24 24"
        className={`h-5 w-5 ${dir === "prev" ? "rotate-180" : ""}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m9 6 6 6-6 6" />
      </svg>
    </button>
  );
}

/**
 * "What will you build?" — a horizontal snap-scroll photo rail. The arrow
 * buttons scroll it one card at a time for mouse users (the rail itself still
 * swipes on touch and scrolls with trackpads) and wrap around at either end,
 * so the gallery loops.
 */
export function Showcase() {
  const railRef = useRef<HTMLDivElement>(null);

  // One card + the gap-5 (20px) between cards, so each click advances a
  // card. Past the last card it wraps back to the first (and vice versa).
  function scrollByCard(dir: 1 | -1) {
    const el = railRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    if (dir === 1 && el.scrollLeft >= max - 8) {
      el.scrollTo({ left: 0, behavior: "smooth" });
      return;
    }
    if (dir === -1 && el.scrollLeft <= 8) {
      el.scrollTo({ left: max, behavior: "smooth" });
      return;
    }
    const card = el.querySelector("a");
    const step = card ? card.clientWidth + 20 : el.clientWidth * 0.8;
    el.scrollBy({ left: dir * step, behavior: "smooth" });
  }

  return (
    <section className="border-y border-stone-200 bg-white py-24 transition-colors duration-500 sm:py-32 dark:border-white/10 dark:bg-white/3">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <Reveal>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-bold tracking-[0.2em] text-amber-600 uppercase dark:text-amber-400">
                The possibilities
              </p>
              <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-5xl">
                What will you build?
              </h2>
            </div>
            <div className="flex items-center gap-3">
              <ArrowButton dir="prev" onClick={() => scrollByCard(-1)} />
              <ArrowButton dir="next" onClick={() => scrollByCard(1)} />
            </div>
          </div>
        </Reveal>
      </div>

      {/* Full-bleed rail: CSS scroll-snap. Padding keeps the first and last
          cards aligned with the page gutter. */}
      <Reveal delay={120}>
        <div
          ref={railRef}
          className="mt-10 flex snap-x snap-mandatory gap-5 overflow-x-auto px-5 pb-4 scrollbar-none sm:scroll-pl-5 [&::-webkit-scrollbar]:hidden"
        >
          {showcaseCards.map((card) => (
            <Link
              key={card.tag}
              href="/auth"
              className="group relative h-96 w-[85vw] shrink-0 snap-center overflow-hidden rounded-3xl sm:w-120 sm:snap-start"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- local asset */}
              <img
                src={card.src}
                alt={`${card.tag} — ${card.line}`}
                loading="lazy"
                className="h-full w-full object-cover transition duration-700 group-hover:scale-105"
              />
              {/* Scrim so the caption reads on any photo */}
              <div className="absolute inset-0 bg-linear-to-t from-black/70 via-black/10 to-transparent" />
              <div className="absolute right-0 bottom-0 left-0 p-6">
                <p className="text-xl font-extrabold text-white">{card.tag}</p>
                <p className="mt-1 text-sm font-medium text-white/75">{card.line}</p>
                <p className="mt-3 inline-flex items-center gap-2 text-xs font-extrabold text-amber-300 opacity-0 transition duration-300 group-hover:opacity-100">
                  Start this project <span aria-hidden>→</span>
                </p>
              </div>
            </Link>
          ))}
        </div>
      </Reveal>
    </section>
  );
}
