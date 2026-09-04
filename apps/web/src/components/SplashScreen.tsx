"use client";

import { useEffect, useRef, useState } from "react";
import { APP_NAME } from "@buildora/shared";
import { gsap, prefersReducedMotion, useGSAP } from "@/lib/gsap";
import { useSession } from "@/store/useSession";

/** Written once the welcome has played; the rest of the tab's life skips it. */
export const WELCOME_KEY = "buildora-welcomed";

/** The overlay never shows for less than this, so the words can be read. */
const MIN_SHOW_MS = 1100;
/**
 * And never longer than this. A slow network, a cold API, a hero still
 * fetching its frames: none of them are the welcome screen's business. The
 * page behind has its own skeletons for whatever is still on its way.
 */
const MAX_SHOW_MS = 2400;

const lines = [
  "Verified architects, engineers and contractors.",
  "Escrow that releases only on approval.",
  "RAJUK permits, tracked step by step.",
  "From an empty plot to the keys.",
];

/**
 * The welcome screen: wordmark, one sentence about what Buildora is, and a
 * progress bar that fills as the page becomes usable.
 *
 * It shows once per browser session. An inline script in the root layout adds
 * `splash` to <html> before first paint when the session has no flag, and the
 * CSS in globals.css only displays this overlay under that class; so there is
 * no flash of the page underneath, and on later navigations the overlay never
 * appears at all.
 *
 * The bar tracks real readiness (fonts, the session restore, the window load
 * event) rather than a timer, with a floor of MIN_SHOW_MS so a fast machine
 * still gets to read the welcome. The exit is a fade with a slight scale so
 * the page appears to settle into place behind it.
 */
export function SplashScreen() {
  const bootstrapped = useSession((s) => s.bootstrapped);
  const [active, setActive] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [lineIndex, setLineIndex] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const pct = useRef<HTMLSpanElement>(null);
  const progress = useRef({ value: 0 });
  const startedAt = useRef(0);

  // Only the client knows whether the session has been welcomed.
  useEffect(() => {
    if (document.documentElement.classList.contains("splash")) {
      setActive(true);
      startedAt.current = performance.now();
    }
  }, []);

  // Drive the bar toward whatever share of the readiness signals has landed.
  const toProgress = (target: number) => {
    if (!bar.current || !pct.current) return;
    gsap.to(progress.current, {
      value: target,
      duration: 0.6,
      ease: "power2.out",
      overwrite: "auto",
      onUpdate: () => {
        const v = progress.current.value;
        if (bar.current) bar.current.style.transform = `scaleX(${v / 100})`;
        if (pct.current) pct.current.textContent = `${Math.round(v)}`;
      },
    });
  };

  useEffect(() => {
    if (!active) return;
    let fonts = false;
    // DOM ready, not the window load event. The landing page starts fetching
    // a few hundred hero frames before load fires, so waiting for load meant
    // waiting for tens of megabytes on production.
    let loaded = document.readyState !== "loading";
    let cancelled = false;

    const update = () => {
      // Three signals: fonts, session, window load. The bar creeps to 90 on
      // partial readiness and only reaches 100 when everything has landed.
      const done = [fonts, bootstrapped, loaded].filter(Boolean).length;
      toProgress(done === 3 ? 100 : 12 + done * 26);
    };
    update();

    document.fonts?.ready.then(() => {
      if (cancelled) return;
      fonts = true;
      update();
    });
    const onLoad = () => {
      loaded = true;
      update();
    };
    document.addEventListener("DOMContentLoaded", onLoad);

    // Leave once everything is ready and the minimum time has passed.
    const poll = setInterval(() => {
      const elapsed = performance.now() - startedAt.current;
      if (fonts && bootstrapped && loaded && elapsed >= MIN_SHOW_MS) {
        clearInterval(poll);
        setLeaving(true);
      }
    }, 100);
    // Never trap the visitor: whatever is still pending by then is a network
    // that is not coming, and the page behind will show its own loading states.
    const bail = setTimeout(() => setLeaving(true), MAX_SHOW_MS);

    return () => {
      cancelled = true;
      document.removeEventListener("DOMContentLoaded", onLoad);
      clearInterval(poll);
      clearTimeout(bail);
    };
  }, [active, bootstrapped]);

  // The sentence under the title changes every second and a bit.
  useEffect(() => {
    if (!active || leaving) return;
    const t = setInterval(() => setLineIndex((i) => (i + 1) % lines.length), 1400);
    return () => clearInterval(t);
  }, [active, leaving]);

  // Entrance: mark, title, line and bar rise in one after another.
  useGSAP(
    () => {
      const el = root.current;
      if (!el || !active || prefersReducedMotion()) return;
      gsap.fromTo(
        el.querySelectorAll("[data-rise]"),
        { opacity: 0, y: 18 },
        { opacity: 1, y: 0, duration: 0.8, stagger: 0.12, ease: "power3.out", delay: 0.1 }
      );
    },
    { scope: root, dependencies: [active] }
  );

  // Exit: fill the bar, fade the overlay, release the page.
  useGSAP(
    () => {
      const el = root.current;
      if (!el || !leaving) return;
      toProgress(100);
      gsap.to(el, {
        opacity: 0,
        scale: 1.02,
        duration: 0.55,
        delay: 0.25,
        ease: "power2.inOut",
        onComplete: () => {
          try {
            sessionStorage.setItem(WELCOME_KEY, "1");
          } catch {
            /* private mode: it will simply show again next load */
          }
          document.documentElement.classList.remove("splash");
          setActive(false);
        },
      });
    },
    { scope: root, dependencies: [leaving] }
  );

  return (
    <div
      ref={root}
      id="splash"
      aria-hidden={!active}
      role={active ? "status" : undefined}
      aria-live="polite"
      className="splash-screen fixed inset-0 z-[100] place-items-center overflow-hidden bg-[#f5f2ec] text-stone-900 dark:bg-[#060a15] dark:text-white"
    >
      {/* A soft amber light behind the words, drifting slowly. */}
      <div
        aria-hidden
        className="animate-drift-a pointer-events-none absolute -top-40 left-1/2 h-[42rem] w-[42rem] -translate-x-1/2"
        style={{ background: "radial-gradient(closest-side, rgba(245,180,0,0.28), transparent)" }}
      />

      <div className="relative flex w-full max-w-md flex-col items-center px-8 text-center">
        <span
          data-rise
          className="grid h-14 w-14 place-items-center rounded-2xl bg-stone-900 text-amber-400 shadow-xl shadow-black/15 dark:bg-white dark:text-stone-900"
        >
          <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" aria-hidden>
            <path
              d="M4 20V8.5L12 3l8 5.5V20"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>

        <p
          data-rise
          className="mt-8 text-[0.7rem] font-bold tracking-[0.28em] text-stone-500 uppercase dark:text-slate-400"
        >
          Welcome to
        </p>
        <h1 data-rise className="display-title mt-2 text-5xl sm:text-6xl">
          {APP_NAME}
        </h1>

        {/* Each sentence crossfades in place; a fixed height keeps the bar
            from moving as sentences of different lengths come and go. */}
        <div data-rise className="relative mt-5 h-12 w-full">
          {lines.map((line, i) => (
            <p
              key={line}
              aria-hidden={i !== lineIndex}
              className={`absolute inset-x-0 top-0 text-base text-stone-600 transition-[opacity,translate] duration-500 ease-out dark:text-slate-400 ${
                i === lineIndex ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"
              }`}
            >
              {line}
            </p>
          ))}
        </div>

        <div data-rise className="mt-8 w-full">
          <div className="flex items-baseline justify-between">
            <span className="text-[0.68rem] font-bold tracking-[0.2em] text-stone-500 uppercase dark:text-slate-400">
              Loading
            </span>
            <span className="display-title text-xl tabular-nums">
              <span ref={pct}>0</span>
              <span className="text-sm text-stone-500 dark:text-slate-400">%</span>
            </span>
          </div>
          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-stone-900/10 dark:bg-white/10">
            <div
              ref={bar}
              className="h-full w-full origin-left rounded-full bg-amber-400"
              style={{ transform: "scaleX(0)" }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
