"use client";

import { useEffect, useRef } from "react";
import { FRAME_COUNT, frameSrc, type ThemeMode } from "@/lib/frames";
import { smoothScrollToId } from "@/lib/smoothScroll";
import { useTheme } from "@/store/useTheme";

/** Intercepts an in-page anchor click and swoops to its section instead. */
function onAnchorClick(e: React.MouseEvent<HTMLAnchorElement>) {
  e.preventDefault();
  smoothScrollToId(e.currentTarget.hash.slice(1));
}

/** Copy stages shown over the animation, keyed to scroll progress windows. */
const STAGES: { start: number; end: number; eyebrow: string; title: string; sub: string }[] = [
  {
    start: 0,
    end: 0.26,
    eyebrow: "01 · Trusted",
    title: "Build with confidence.",
    sub: "The construction super-platform for Bangladesh.",
  },
  {
    start: 0.3,
    end: 0.54,
    eyebrow: "02 · End to end",
    title: "From first sketch to final handover.",
    sub: "Verified architects, engineers, and contractors — all in one place.",
  },
  {
    start: 0.58,
    end: 0.82,
    eyebrow: "03 · Protected",
    title: "Every payment protected.",
    sub: "Escrow-backed milestones. RAJUK permits tracked end to end.",
  },
];

const FADE = 0.06;
const CROSSFADE_MS = 400;

function stageOpacity(p: number, start: number, end: number): number {
  if (start === 0 && p < start + FADE) return 1; // first stage starts visible
  const fadeIn = Math.min(1, Math.max(0, (p - start) / FADE));
  const fadeOut = Math.min(1, Math.max(0, (end - p) / FADE));
  return Math.max(0, Math.min(fadeIn, fadeOut));
}

type FrameSets = Record<ThemeMode, (HTMLImageElement | undefined)[]>;

export function HeroScrub() {
  const mode = useTheme((s) => s.mode);
  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const ctaRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const skipRef = useRef<HTMLButtonElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const fadeGroupRef = useRef<HTMLDivElement>(null);
  const hintFadeRef = useRef<HTMLDivElement>(null);
  const loadPillRef = useRef<HTMLDivElement>(null);

  const framesRef = useRef<FrameSets>({ day: [], night: [] });
  const loadedCountRef = useRef<Record<ThemeMode, number>>({ day: 0, night: 0 });
  const startedRef = useRef<Record<ThemeMode, boolean>>({ day: false, night: false });
  const modeRef = useRef<ThemeMode>(mode);
  const smoothedRef = useRef(0);
  const lastDrawnRef = useRef<{ img: HTMLImageElement; mode: ThemeMode } | null>(null);
  const fadeRef = useRef<{ from: HTMLImageElement; startedAt: number } | null>(null);

  // Kick off (or resume) loading a frame set with a small worker pool.
  function ensureSetLoading(m: ThemeMode) {
    if (startedRef.current[m]) return;
    startedRef.current[m] = true;
    const images = framesRef.current[m];
    let next = 0;
    const worker = () => {
      if (next >= FRAME_COUNT) return;
      const i = next++;
      const img = new Image();
      img.onload = () => {
        images[i] = img;
        loadedCountRef.current[m] += 1;
        worker();
      };
      img.onerror = () => worker();
      img.src = frameSrc(m, i);
    };
    for (let w = 0; w < 8; w++) worker();
  }

  // On theme switch: snapshot the last frame for a crossfade, load the new set.
  useEffect(() => {
    const previous = modeRef.current;
    modeRef.current = mode;
    ensureSetLoading(mode);
    if (previous !== mode && lastDrawnRef.current) {
      fadeRef.current = { from: lastDrawnRef.current.img, startedAt: performance.now() };
    }
  }, [mode]);

  useEffect(() => {
    ensureSetLoading(modeRef.current);
    // Prefetch the other set once the browser is idle so toggling feels instant.
    const other: ThemeMode = modeRef.current === "day" ? "night" : "day";
    const idle = window.setTimeout(() => ensureSetLoading(other), 4000);

    const canvas = canvasRef.current;
    const section = sectionRef.current;
    if (!canvas || !section) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function nearestLoaded(images: (HTMLImageElement | undefined)[], target: number) {
      if (images[target]) return images[target];
      for (let d = 1; d < FRAME_COUNT; d++) {
        if (images[target - d]) return images[target - d];
        if (images[target + d]) return images[target + d];
      }
      return undefined;
    }

    function drawCover(image: HTMLImageElement, alpha: number) {
      if (!canvas || !ctx) return;
      const cw = canvas.clientWidth;
      const ch = canvas.clientHeight;
      const scale = Math.max(cw / image.naturalWidth, ch / image.naturalHeight);
      const dw = image.naturalWidth * scale;
      const dh = image.naturalHeight * scale;
      ctx.globalAlpha = alpha;
      ctx.drawImage(image, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
      ctx.globalAlpha = 1;
    }

    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (!canvas || !ctx || !section) return;

      // Keep the canvas buffer matched to its CSS size and pixel ratio.
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const bw = Math.floor(canvas.clientWidth * dpr);
      const bh = Math.floor(canvas.clientHeight * dpr);
      if (canvas.width !== bw || canvas.height !== bh) {
        canvas.width = bw;
        canvas.height = bh;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      // Scroll progress through the tall section (0 → 1).
      const rect = section.getBoundingClientRect();
      const scrollable = rect.height - window.innerHeight;
      const progress = Math.max(0, Math.min(1, scrollable > 0 ? -rect.top / scrollable : 0));

      // Ease the frame index toward the target for an inertial feel.
      const target = progress * (FRAME_COUNT - 1);
      smoothedRef.current += (target - smoothedRef.current) * 0.16;
      if (Math.abs(target - smoothedRef.current) < 0.02) smoothedRef.current = target;
      const index = Math.round(smoothedRef.current);

      const m = modeRef.current;
      const img = nearestLoaded(framesRef.current[m], index);
      if (img) {
        const fade = fadeRef.current;
        if (fade) {
          const t = (performance.now() - fade.startedAt) / CROSSFADE_MS;
          if (t >= 1) {
            fadeRef.current = null;
            drawCover(img, 1);
          } else {
            drawCover(fade.from, 1);
            drawCover(img, t);
          }
        } else {
          drawCover(img, 1);
        }
        lastDrawnRef.current = { img, mode: m };
      }

      // Scrub progress bar along the top of the hero.
      if (barRef.current) {
        barRef.current.style.transform = `scaleX(${progress.toFixed(4)})`;
      }

      // Stage copy opacity/parallax, driven imperatively to avoid re-renders.
      STAGES.forEach((stage, i) => {
        const el = stageRefs.current[i];
        if (!el) return;
        const o = stageOpacity(progress, stage.start, stage.end);
        el.style.opacity = o.toFixed(3);
        el.style.transform = `translateY(${((1 - o) * 14).toFixed(1)}px)`;
        el.style.visibility = o === 0 ? "hidden" : "visible";
      });

      // Closing CTA fades in near the end and stays.
      if (ctaRef.current) {
        const o = Math.max(0, Math.min(1, (progress - 0.86) / FADE));
        ctaRef.current.style.opacity = o.toFixed(3);
        ctaRef.current.style.visibility = o === 0 ? "hidden" : "visible";
        ctaRef.current.style.pointerEvents = o > 0.5 ? "auto" : "none";
      }

      // Scroll hint fades out as soon as scrolling starts.
      if (hintRef.current) {
        hintRef.current.style.opacity = String(Math.max(0, 1 - progress * 25));
      }

      // Skip button stays available until the closing CTA takes over.
      if (skipRef.current) {
        const o = Math.max(0, Math.min(1, 1 - (progress - 0.78) / 0.08));
        skipRef.current.style.opacity = o.toFixed(3);
        skipRef.current.style.pointerEvents = o > 0.3 ? "auto" : "none";
      }

      // Tiny loading indicator until the active set is fully cached.
      if (loadPillRef.current) {
        const count = loadedCountRef.current[m];
        const done = count >= FRAME_COUNT;
        loadPillRef.current.style.opacity = done ? "0" : "1";
        if (!done) {
          loadPillRef.current.textContent = `Loading scene ${Math.round((count / FRAME_COUNT) * 100)}%`;
        }
      }
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(idle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Skips past the hero scrub only, landing on the very next section.
  const skipToContent = () => smoothScrollToId("intro");

  return (
    <section ref={sectionRef} id="hero" className="relative h-[320vh]">
      <div className="sticky top-0 h-screen w-full overflow-hidden bg-stone-200 dark:bg-[#060a15]">
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden />

        {/* Legibility gradients over the imagery */}
        <div ref={fadeGroupRef} className="pointer-events-none absolute inset-0">
          {/* Legibility gradients over the imagery */}
          <div className="absolute inset-x-0 top-0 h-40 bg-linear-to-b from-black/50 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-56 bg-linear-to-t from-black/60 to-transparent" />
        </div>

        {/* Scrub progress bar */}
        <div
          ref={barRef}
          className="absolute inset-x-0 top-0 z-10 h-0.5 origin-left bg-amber-400/90"
          style={{ transform: "scaleX(0)" }}
        />

        {/* Scroll-staged copy */}
        {STAGES.map((stage, i) => (
          <div
            key={stage.title}
            ref={(el) => {
              stageRefs.current[i] = el;
            }}
            className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center"
            style={{ opacity: i === 0 ? 1 : 0 }}
          >
            <p className="animate-fade-down mb-5 text-xs font-bold tracking-[0.35em] text-amber-300/95 uppercase drop-shadow-[0_1px_6px_rgba(0,0,0,0.6)]">
              {stage.eyebrow}
            </p>
            <h1 className="animate-fade-up max-w-4xl text-4xl font-extrabold tracking-tight text-white drop-shadow-[0_2px_16px_rgba(0,0,0,0.55)] sm:text-6xl md:text-7xl">
              {stage.title}
            </h1>
            <p className="animate-fade-up mt-5 max-w-xl text-base font-medium text-white/85 drop-shadow-[0_1px_8px_rgba(0,0,0,0.6)] [animation-delay:180ms] sm:text-xl">
              {stage.sub}
            </p>
          </div>
        ))}

        {/* Closing CTA */}
        <div
          ref={ctaRef}
          className="absolute inset-0 flex flex-col items-center justify-center gap-8 px-6 text-center"
          style={{ opacity: 0, pointerEvents: "none" }}
        >
          <h2 className="max-w-3xl text-4xl font-extrabold tracking-tight text-white drop-shadow-[0_2px_16px_rgba(0,0,0,0.55)] sm:text-6xl">
            Your home. Built right.
          </h2>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <a
              href="#cta"
              onClick={onAnchorClick}
              className="rounded-full bg-white px-7 py-3.5 text-sm font-bold text-stone-900 shadow-xl transition hover:scale-[1.03] hover:bg-stone-100"
            >
              Start your project
            </a>
            <a
              href="#features"
              onClick={onAnchorClick}
              className="rounded-full border border-white/40 bg-white/10 px-7 py-3.5 text-sm font-bold text-white backdrop-blur transition hover:bg-white/20"
            >
              Explore the platform
            </a>
          </div>
        </div>

        {/* Scroll hint + loading pill (also inside the pull fade-out) */}
        <div ref={hintFadeRef} className="pointer-events-none absolute inset-0">
          <div
            ref={hintRef}
            className="absolute inset-x-0 bottom-8 flex flex-col items-center gap-2 text-white/80"
          >
            <span className="text-xs font-semibold tracking-[0.25em] uppercase">Scroll</span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="animate-bounce">
              <path
                d="M6 9l6 6 6-6"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div
            ref={loadPillRef}
            className="absolute bottom-8 left-5 rounded-full bg-black/50 px-3 py-1.5 text-xs font-medium text-white/90 backdrop-blur transition-opacity duration-500 sm:left-8"
            style={{ opacity: 0 }}
          />
        </div>

        {/* Skip the scrub — smooth-scrolls to the first section */}
        <button
          ref={skipRef}
          type="button"
          onClick={skipToContent}
          className="absolute right-24 bottom-8 flex items-center gap-2 rounded-full border border-white/25 bg-black/40 px-4 py-2 text-xs font-bold tracking-wide text-white/90 backdrop-blur transition-colors hover:bg-black/65 sm:right-26"
        >
          Skip intro
          <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5">
            <g stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 5l6 6 6-6" />
              <path d="M6 13l6 6 6-6" />
            </g>
          </svg>
        </button>
      </div>
    </section>
  );
}
