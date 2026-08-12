"use client";

import { Check, Lock } from "lucide-react";
import type { TabKey } from "./tabs";

export interface TabDescriptor {
  key: TabKey;
  label: string;
  /** 0–1 for the four phase tabs; undefined for Overview / Diary / Documents. */
  fraction?: number;
  /** Locked tabs stay visible and explain themselves when opened. */
  locked?: boolean;
  /** Something is waiting on the viewer — draws the amber dot. */
  needsYou?: boolean;
}

/**
 * The hub's navigation: one button per phase, in journey order.
 *
 * Locked tabs are shown rather than hidden — knowing the permit comes after the
 * drawings is most of what makes the page feel organised, and a tab row that
 * grows as the project advances is disorienting. Scrolls horizontally on mobile.
 */
export function ProjectTabs({
  tabs,
  current,
  onSelect,
}: {
  tabs: TabDescriptor[];
  current: TabKey;
  onSelect: (key: TabKey) => void;
}) {
  return (
    <div className="-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
      <nav
        aria-label="Project sections"
        className="flex min-w-max gap-1.5 rounded-2xl border border-white/50 bg-white/55 p-1.5 backdrop-blur-xl dark:border-white/10 dark:bg-white/5"
      >
        {tabs.map((tab) => {
          const active = tab.key === current;
          const complete = tab.fraction !== undefined && tab.fraction >= 1;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onSelect(tab.key)}
              aria-current={active ? "page" : undefined}
              className={`relative flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${
                active
                  ? "bg-stone-900 text-white dark:bg-amber-400 dark:text-stone-950"
                  : "text-stone-600 hover:bg-white/60 hover:text-stone-900 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-200"
              }`}
            >
              {/* State marker: done, locked, or a percentage ring for a phase
                  in progress. Overview/Diary/Documents have no state. */}
              {complete ? (
                <span
                  className={`grid h-4 w-4 shrink-0 place-items-center rounded-full ${
                    active ? "bg-white/25" : "bg-emerald-500"
                  }`}
                >
                  <Check className="h-2.5 w-2.5 text-white" />
                </span>
              ) : tab.locked ? (
                <Lock className="h-3.5 w-3.5 shrink-0 opacity-50" />
              ) : tab.fraction !== undefined ? (
                <span
                  className={`h-1.5 w-6 shrink-0 overflow-hidden rounded-full ${
                    active ? "bg-white/25 dark:bg-black/20" : "bg-black/10 dark:bg-white/15"
                  }`}
                >
                  <span
                    className="block h-full rounded-full bg-amber-400 transition-all duration-500"
                    style={{ width: `${Math.round(tab.fraction * 100)}%` }}
                  />
                </span>
              ) : null}

              {tab.label}

              {/* Needs-you dot. Hidden on the active tab — you're already here. */}
              {tab.needsYou && !active && (
                <span
                  aria-label="Needs your attention"
                  className="h-2 w-2 shrink-0 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.7)]"
                />
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
