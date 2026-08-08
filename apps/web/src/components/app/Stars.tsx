"use client";

import { Star } from "lucide-react";

/**
 * Read-only star row for a rating.
 *
 * A rating of 4.3 fills four stars and shows the number beside them rather than
 * trying to draw a partial star — the digits are what people actually read, and
 * a clipped half-star is easy to misjudge at this size.
 */
export function Stars({
  rating,
  count,
  size = "sm",
}: {
  /** 1–5, or undefined when nobody has rated them yet. */
  rating?: number;
  /**
   * How many reviews the rating averages. Omit it for a single review's own
   * score, which renders as bare stars — an average and a "(1 review)" tally
   * would both be noise next to one person's opinion.
   */
  count?: number;
  size?: "sm" | "lg";
}) {
  const star = size === "lg" ? "h-5 w-5" : "h-3.5 w-3.5";
  const text = size === "lg" ? "text-sm" : "text-xs";

  if (!rating || count === 0) {
    return <span className={`${text} text-stone-500 dark:text-slate-500`}>No ratings yet</span>;
  }

  const filled = Math.round(rating);
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex" aria-label={`${rating} out of 5`}>
        {[1, 2, 3, 4, 5].map((i) => (
          <Star
            key={i}
            aria-hidden
            className={`${star} ${
              i <= filled ? "fill-amber-400 text-amber-400" : "text-stone-300 dark:text-slate-600"
            }`}
          />
        ))}
      </span>
      {count !== undefined && (
        <>
          <span className={`${text} font-bold`}>{rating.toFixed(1)}</span>
          <span className={`${text} text-stone-500 dark:text-slate-500`}>
            ({count} review{count === 1 ? "" : "s"})
          </span>
        </>
      )}
    </span>
  );
}

/**
 * Clickable 1–5 star picker for the review form. Kept as real radio inputs so
 * it works with the keyboard and screen readers; the visual stars are labels.
 */
export function StarPicker({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (rating: number) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset disabled={disabled} className="flex items-center gap-1">
      <legend className="sr-only">Rating out of 5</legend>
      {[1, 2, 3, 4, 5].map((i) => (
        <label key={i} className="cursor-pointer disabled:cursor-default">
          <input
            type="radio"
            name="rating"
            value={i}
            checked={value === i}
            onChange={() => onChange(i)}
            className="sr-only peer"
          />
          <span className="sr-only">
            {i} star{i === 1 ? "" : "s"}
          </span>
          <Star
            aria-hidden
            className={`h-7 w-7 transition peer-focus-visible:ring-2 peer-focus-visible:ring-amber-400 rounded ${
              i <= value
                ? "fill-amber-400 text-amber-400"
                : "text-stone-300 hover:text-amber-300 dark:text-slate-600"
            }`}
          />
        </label>
      ))}
    </fieldset>
  );
}
