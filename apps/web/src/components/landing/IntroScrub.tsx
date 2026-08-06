"use client";

import { useRef } from "react";
import { gsap, prefersReducedMotion, useGSAP } from "@/lib/gsap";

// The statement, one word at a time. Accented words render in amber.
const words =
  "Buildora brings land owners, architects, engineers, and contractors into one accountable place — so the home you imagine is the home that gets built.".split(
    " "
  );
const accents = new Set(["accountable", "built."]);

/**
 * The intro statement under the hero: an editorial paragraph whose words ink
 * in one by one as it scrolls through the viewport.
 *
 * A single GSAP tween animates every word, and `stagger` offsets each one so
 * they arrive in sequence. `scrub: true` ties the whole thing to the scrollbar
 * instead of playing on its own clock, so scrolling back up un-inks the words.
 */
export function IntroScrub() {
  const sectionRef = useRef<HTMLElement>(null);
  const paragraphRef = useRef<HTMLParagraphElement>(null);

  useGSAP(
    () => {
      const paragraph = paragraphRef.current;
      if (!paragraph) return;

      const wordEls = paragraph.querySelectorAll<HTMLSpanElement>("[data-word]");

      if (prefersReducedMotion()) {
        gsap.set(wordEls, { opacity: 1, y: 0 });
        return;
      }

      gsap.fromTo(
        wordEls,
        { opacity: 0.12, y: 6 },
        {
          opacity: 1,
          y: 0,
          // Linear, because the scrollbar is already supplying the pacing —
          // any extra easing here would fight the user's scroll.
          ease: "none",
          duration: 0.6,
          // Words overlap slightly as they ink, which reads as a wave.
          stagger: 0.35,
          scrollTrigger: {
            trigger: paragraph,
            // Starts when the paragraph's top reaches 90% down the screen and
            // finishes as its bottom passes the midpoint — fully inked while
            // still comfortably in view.
            start: "top 90%",
            end: "bottom 50%",
            // A small number instead of `true` adds catch-up smoothing, so
            // fast scroll-wheel flicks glide rather than snap.
            scrub: 0.5,
          },
        }
      );
    },
    { scope: sectionRef }
  );

  return (
    <section
      ref={sectionRef}
      id="intro"
      className="relative overflow-hidden border-b border-stone-200 py-24 transition-colors duration-500 sm:py-32 dark:border-white/10"
    >
      {/* Quiet backdrop: the photo is softened and veiled by a heavy scrim so
          it reads as texture behind the words, not a second hero. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- local asset */}
      <img
        src="/landing/concrete-white.jpg"
        alt=""
        loading="lazy"
        aria-hidden
        className="absolute inset-0 h-full w-full scale-105 object-cover blur-[2px]"
      />
      <div className="absolute inset-0 bg-white/85 dark:bg-[#05070C]/85" />

      <p
        ref={paragraphRef}
        className="relative mx-auto max-w-4xl px-5 text-center text-2xl leading-snug font-extrabold tracking-tight sm:px-8 sm:text-4xl"
      >
        {words.map((word, i) => (
          <span
            key={i}
            data-word
            className={`mr-[0.28em] inline-block ${
              accents.has(word) ? "text-amber-600 dark:text-amber-400" : ""
            }`}
          >
            {word}
          </span>
        ))}
      </p>
    </section>
  );
}
