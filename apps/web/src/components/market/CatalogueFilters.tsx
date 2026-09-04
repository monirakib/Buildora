"use client";

import { useEffect, useId, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { ProductCategory } from "@buildora/shared";
import { categoryLabels, formatBdt } from "./market";

/** What the catalogue is filtered by. Lives in the page; the sidebar edits it. */
export interface CatalogueFilterState {
  search: string;
  category: string;
  minPrice: number;
  maxPrice: number;
}

export const EMPTY_FILTERS: CatalogueFilterState = {
  search: "",
  category: "",
  minPrice: 0,
  maxPrice: 0,
};

const inputClass =
  "block w-full rounded-xl border border-stone-300/80 bg-white/70 px-3 py-2 text-sm text-stone-900 placeholder-stone-400 transition outline-none focus:border-amber-500 focus:bg-white focus:ring-2 focus:ring-amber-400/30 dark:border-white/15 dark:bg-white/5 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:bg-white/10";

/**
 * A titled block in the sidebar that folds shut.
 *
 * Folding animates the outer grid from 1fr to 0fr, which the browser resolves
 * against the content's real height. A max-height guess would either clip a
 * long list or coast through empty space on a short one.
 */
function Section({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <section className="border-b border-black/5 last:border-b-0 dark:border-white/10">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={id}
        className="flex w-full items-center justify-between px-4 py-3.5 text-left text-sm font-extrabold tracking-tight"
      >
        {title}
        <ChevronDown
          className={`h-4 w-4 text-stone-400 transition-transform duration-300 ease-out ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      <div
        id={id}
        className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">
          <div className="px-4 pb-4">{children}</div>
        </div>
      </div>
    </section>
  );
}

/** Rounds the catalogue's dearest price up to a tidy slider ceiling. */
function niceCeiling(max: number): number {
  if (max <= 0) return 10000;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  return Math.ceil(max / magnitude) * magnitude;
}

/**
 * Two thumbs on one track, plus the two numbers underneath.
 *
 * The slider edits a local copy while a thumb is being dragged and only
 * reports the band 350ms after the last movement: every report refetches the
 * catalogue, and a drag produces dozens of values a second.
 */
function PriceRange({
  ceiling,
  min,
  max,
  onChange,
}: {
  ceiling: number;
  min: number;
  max: number;
  onChange: (min: number, max: number) => void;
}) {
  const step = Math.max(1, Math.round(ceiling / 200));
  const [lo, setLo] = useState(min);
  const [hi, setHi] = useState(max || ceiling);

  // Follow the committed band when it changes from outside (a "clear" click).
  useEffect(() => {
    setLo(min);
    setHi(max || ceiling);
  }, [min, max, ceiling]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const nextMin = lo <= 0 ? 0 : lo;
      const nextMax = hi >= ceiling ? 0 : hi;
      if (nextMin !== min || nextMax !== max) onChange(nextMin, nextMax);
    }, 350);
    return () => clearTimeout(timer);
    // Only the local thumbs should schedule a commit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lo, hi]);

  const pct = (v: number) => `${Math.min(100, Math.max(0, (v / ceiling) * 100))}%`;

  return (
    <div>
      <div className="range-dual mt-1">
        <div className="range-track" />
        <div className="range-fill" style={{ left: pct(lo), right: `calc(100% - ${pct(hi)})` }} />
        <input
          type="range"
          min={0}
          max={ceiling}
          step={step}
          value={lo}
          onChange={(e) => setLo(Math.min(Number(e.target.value), hi - step))}
          aria-label="Minimum price"
          // The lower thumb sits above the upper one only when both are pushed
          // to the right end, so the buyer can always grab the one they need.
          style={{ zIndex: lo > ceiling - step * 4 ? 5 : 3 }}
        />
        <input
          type="range"
          min={0}
          max={ceiling}
          step={step}
          value={hi}
          onChange={(e) => setHi(Math.max(Number(e.target.value), lo + step))}
          aria-label="Maximum price"
          style={{ zIndex: 4 }}
        />
      </div>
      <div className="mt-3 flex items-center gap-2">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Minimum price in taka</span>
          <input
            type="number"
            min={0}
            max={ceiling}
            value={lo}
            onChange={(e) => setLo(Math.max(0, Math.min(Number(e.target.value) || 0, hi - step)))}
            className={`${inputClass} text-center tabular-nums`}
          />
        </label>
        <span className="text-xs font-bold text-stone-400">to</span>
        <label className="min-w-0 flex-1">
          <span className="sr-only">Maximum price in taka</span>
          <input
            type="number"
            min={0}
            max={ceiling}
            value={hi}
            onChange={(e) =>
              setHi(Math.min(ceiling, Math.max(Number(e.target.value) || 0, lo + step)))
            }
            className={`${inputClass} text-center tabular-nums`}
          />
        </label>
      </div>
      <p className="mt-2 text-xs text-stone-500 dark:text-slate-500">
        {formatBdt(lo)} to {formatBdt(hi)}
        {hi >= ceiling ? "+" : ""}
      </p>
    </div>
  );
}

/**
 * The marketplace's left column: search, price band, category.
 *
 * Laid out the way material shops in Bangladesh already are (Star Tech,
 * Ryans), so a buyer's habits carry over: filters down the left, results on
 * the right, the sort control up by the results. Every filter here maps to a
 * query parameter the API filters on server-side; nothing is filtered in the
 * browser, so the counts are real.
 */
export function CatalogueFilters({
  value,
  onChange,
  priceMaxBdt,
}: {
  value: CatalogueFilterState;
  onChange: (next: CatalogueFilterState) => void;
  /** The dearest active listing, from the API, for the slider's top end. */
  priceMaxBdt: number;
}) {
  const ceiling = niceCeiling(priceMaxBdt);
  const set = (patch: Partial<CatalogueFilterState>) => onChange({ ...value, ...patch });
  const rowClass =
    "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm font-semibold transition hover:bg-stone-900/5 dark:hover:bg-white/5";

  return (
    <div className="overflow-hidden rounded-2xl border border-white/50 bg-white/55 shadow-xl shadow-black/5 backdrop-blur-xl dark:border-white/10 dark:bg-white/5">
      <Section title="Search">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <input
            type="search"
            value={value.search}
            onChange={(e) => set({ search: e.target.value })}
            placeholder="Products, brands…"
            aria-label="Search products"
            className={`${inputClass} pr-9 pl-9 [&::-webkit-search-cancel-button]:hidden`}
          />
          {value.search && (
            <button
              type="button"
              onClick={() => set({ search: "" })}
              aria-label="Clear search"
              className="absolute top-1/2 right-1.5 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-stone-400 transition hover:bg-stone-900/5 hover:text-stone-700 dark:hover:bg-white/10 dark:hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </Section>

      <Section title="Price range">
        <PriceRange
          ceiling={ceiling}
          min={value.minPrice}
          max={value.maxPrice}
          onChange={(minPrice, maxPrice) => set({ minPrice, maxPrice })}
        />
      </Section>

      <Section title="Category">
        <div role="radiogroup" aria-label="Category" className="-mx-2 flex flex-col">
          {[
            ["", "All categories"],
            ...Object.values(ProductCategory).map((c) => [c, categoryLabels[c]]),
          ].map(([key, label]) => {
            const on = value.category === key;
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => set({ category: key })}
                className={`${rowClass} ${on ? "text-stone-900 dark:text-white" : "text-stone-600 dark:text-slate-300"}`}
              >
                {/* The dot fills rather than appearing: a scale transition
                      from 0.3, not from nothing. */}
                <span
                  className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border transition-colors duration-150 ${
                    on
                      ? "border-amber-400 bg-amber-400"
                      : "border-stone-400/70 dark:border-white/30"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full bg-stone-950 transition-[scale,opacity] duration-200 ease-out ${
                      on ? "scale-100 opacity-100" : "scale-30 opacity-0"
                    }`}
                  />
                </span>
                {label}
              </button>
            );
          })}
        </div>
      </Section>
    </div>
  );
}
