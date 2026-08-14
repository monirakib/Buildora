"use client";

import type { ReactNode } from "react";

/**
 * The shell every inline AI helper sits in — the brief coach, the bid check,
 * the proposal drafter, the diary digest.
 *
 * One shell for all four so they read as one feature rather than four bolted-on
 * ones, and so the disclaimer is impossible to forget: everything these produce
 * is guidance, and on anything touching a permit it is RAJUK that decides.
 *
 * Note there is no auto-run here. Each panel is opened by a button the user
 * presses, never on render and never as they type. That keeps a free-tier quota
 * from draining while someone fills in a form, and keeps the page quiet until
 * help is actually wanted.
 */
export function AiPanel({
  title,
  subtitle,
  busy,
  error,
  footer = "Guidance only. RAJUK decides.",
  children,
}: {
  title: string;
  subtitle?: string;
  busy?: boolean;
  error?: string | null;
  /** Override for panels where RAJUK isn't the authority (bids, diaries). */
  footer?: string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-400/5 p-4 dark:border-amber-400/25">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-extrabold tracking-tight">{title}</p>
          {subtitle && (
            <p className="mt-0.5 text-xs text-stone-500 dark:text-slate-400">{subtitle}</p>
          )}
        </div>
        {busy && <AiDots />}
      </div>

      {error && (
        <p className="mt-3 rounded-lg bg-rose-500/15 px-3 py-2 text-sm font-medium text-rose-700 dark:text-rose-300">
          {error}
        </p>
      )}

      {children && <div className="mt-3">{children}</div>}

      <p className="mt-3 text-xs text-stone-500 dark:text-slate-400">{footer}</p>
    </div>
  );
}

/** The three bouncing dots used wherever the platform is waiting on a model. */
export function AiDots() {
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          style={{ animationDelay: `${delay}ms` }}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-amber-500/70"
        />
      ))}
    </span>
  );
}
