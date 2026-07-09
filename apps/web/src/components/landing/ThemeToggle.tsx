"use client";

import { useTheme } from "@/store/useTheme";

/**
 * Day/night switch. Visual state is fully CSS-driven via the `dark` class,
 * so server and client render identical markup (no hydration mismatch).
 */
export function ThemeToggle() {
  const toggle = useTheme((s) => s.toggle);

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle day and night mode"
      className="relative inline-flex h-9 w-[4.25rem] items-center rounded-full border border-white/25 bg-white/15 backdrop-blur transition-colors hover:bg-white/25 dark:border-white/15 dark:bg-white/10 dark:hover:bg-white/20"
    >
      {/* Sun (day) */}
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className="absolute left-2 h-4 w-4 text-amber-300 dark:text-white/40"
      >
        <circle cx="12" cy="12" r="4.2" fill="currentColor" />
        <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5.2 5.2l1.7 1.7M17.1 17.1l1.7 1.7M18.8 5.2l-1.7 1.7M6.9 17.1l-1.7 1.7" />
        </g>
      </svg>
      {/* Moon (night) */}
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className="absolute right-2 h-4 w-4 text-white/40 dark:text-sky-200"
      >
        <path
          d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"
          fill="currentColor"
        />
      </svg>
      {/* Knob */}
      <span className="absolute left-1 h-7 w-7 rounded-full bg-white shadow-md transition-transform duration-300 dark:translate-x-[1.95rem] dark:bg-slate-800" />
    </button>
  );
}
