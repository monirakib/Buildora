"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform, type MotionValue } from "motion/react";

// The statement, one word at a time. Accented words render in amber.
const words =
  "Buildora brings land owners, architects, engineers, and contractors into one accountable place — so the home you imagine is the home that gets built.".split(
    " "
  );
const accents = new Set(["accountable", "built."]);

/** One word whose opacity is driven by its slice of the scroll progress. */
function Word({
  word,
  index,
  progress,
}: {
  word: string;
  index: number;
  progress: MotionValue<number>;
}) {
  // Each word owns an equal slice of the 0→1 progress and fades in across it.
  const start = index / words.length;
  const end = (index + 1) / words.length;
  const opacity = useTransform(progress, [start, end], [0.12, 1]);

  return (
    <motion.span
      style={{ opacity }}
      className={`mr-[0.28em] inline-block ${
        accents.has(word) ? "text-amber-600 dark:text-amber-400" : ""
      }`}
    >
      {word}
    </motion.span>
  );
}

/**
 * The intro statement under the hero: an editorial paragraph whose words ink
 * in one by one as it scrolls through the viewport (useScroll maps the
 * paragraph's position to 0→1; each word fades in across its own slice).
 */
export function IntroScrub() {
  const ref = useRef<HTMLParagraphElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    // 0 when the paragraph's top reaches 90% down the screen; 1 when its
    // bottom passes the midpoint — fully inked while still comfortably in view.
    offset: ["start 0.9", "end 0.5"],
  });

  return (
    <section
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
        ref={ref}
        className="relative mx-auto max-w-4xl px-5 text-center text-2xl leading-snug font-extrabold tracking-tight sm:px-8 sm:text-4xl"
      >
        {words.map((word, i) => (
          <Word key={i} word={word} index={i} progress={scrollYProgress} />
        ))}
      </p>
    </section>
  );
}
