import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The shared shell for the pages nobody plans to see — 404, crashes, and the
 * "this went wrong" states. Kept in one place so all of them stay on-brand
 * instead of each reinventing the glass card.
 */
export function StatusScreen({
  code,
  title,
  message,
  children,
}: {
  code: string;
  title: string;
  message: string;
  children?: ReactNode;
}) {
  return (
    <main className="flex min-h-screen flex-1 items-center justify-center px-5 py-24 sm:px-8">
      <div className="w-full max-w-lg rounded-3xl border border-white/50 bg-white/55 p-8 text-center shadow-xl shadow-black/5 backdrop-blur-xl sm:p-10 dark:border-white/10 dark:bg-white/5">
        <span className="grid h-14 w-14 mx-auto place-items-center rounded-2xl bg-amber-400 text-stone-950">
          <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" aria-hidden="true">
            <path
              d="M4 20V8.5L12 3l8 5.5V20"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>

        <p className="mt-6 text-sm font-bold tracking-[0.2em] text-amber-800 uppercase dark:text-amber-400">
          {code}
        </p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h1>
        <p className="mt-3 text-stone-600 dark:text-slate-400">{message}</p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {children}
          <Link
            href="/"
            className="rounded-xl border border-black/10 px-5 py-2.5 text-sm font-bold transition hover:border-amber-400/60 hover:text-amber-700 dark:border-white/15 dark:hover:text-amber-400"
          >
            Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}

/** The primary action button, so the callers don't repeat the class string. */
export const actionClass =
  "rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-bold text-stone-950 shadow-lg shadow-amber-400/25 transition hover:bg-amber-300";
