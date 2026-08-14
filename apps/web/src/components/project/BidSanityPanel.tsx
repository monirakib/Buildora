"use client";

import { useState } from "react";
import type { BidSanityResult } from "@buildora/shared";
import { checkBid } from "@/lib/apiAssistant";
import { AiPanel } from "@/components/assistant/AiPanel";

/**
 * "Check my pricing" — a contractor's own look at their draft rates before
 * they submit, compared against the platform's rate table.
 *
 * What it deliberately never shows is a benchmark figure. The rate table is
 * where the owner's guide rates come from, so an exact percentage would let a
 * bidder work backwards to the owner's estimate — which is precisely what the
 * sealed-bid design exists to prevent. Directions and coarse bands are enough
 * to catch a rate typed in the wrong unit, which is the mistake this is for.
 */

const bandLabels: Record<string, string> = {
  "25-50%": "noticeably",
  "50-100%": "well",
  "100%+": "far",
};

export function BidSanityPanel({
  token,
  tenderId,
  lines,
  timelineWeeks,
}: {
  token: string;
  tenderId: string;
  /** The rates as currently typed, so the check reflects the live form. */
  lines: { itemId: string; ratePerUnitBdt: number }[];
  timelineWeeks?: number;
}) {
  const [result, setResult] = useState<BidSanityResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const priced = lines.filter((l) => l.ratePerUnitBdt > 0);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      setResult(await checkBid(token, tenderId, priced, timelineWeeks));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't check the pricing");
    } finally {
      setBusy(false);
    }
  }

  if (!result && !busy && !error) {
    return (
      <button
        type="button"
        onClick={() => void run()}
        disabled={priced.length === 0}
        className="w-full rounded-xl border border-amber-500/40 bg-amber-400/10 px-4 py-3 text-sm font-bold text-amber-800 transition hover:bg-amber-400/20 disabled:cursor-not-allowed disabled:opacity-50 dark:text-amber-300"
      >
        {priced.length === 0
          ? "Price some lines to check your bid"
          : `Check my pricing (${priced.length} line${priced.length === 1 ? "" : "s"})`}
      </button>
    );
  }

  return (
    <AiPanel
      title="Pricing check"
      subtitle={
        result
          ? result.outliers.length === 0
            ? "Nothing stands out"
            : `${result.outliers.length} line${result.outliers.length === 1 ? "" : "s"} worth a second look`
          : "Comparing your rates"
      }
      busy={busy}
      error={error}
      footer="Your own check. Nothing here is shared with the owner or other bidders."
    >
      {result && (
        <div className="space-y-3">
          <div className="rounded-xl border border-black/10 bg-white/50 px-3 py-2.5 text-sm dark:border-white/10 dark:bg-white/5">
            <p className="font-bold">Your total: ৳{result.yourTotalBdt.toLocaleString("en-US")}</p>
            <p className="mt-1 text-xs text-stone-600 dark:text-slate-400">
              {result.linesBenchmarked} of {result.linesPriced} lines matched the platform rate
              table
              {result.linesUnmatched > 0 && ` · ${result.linesUnmatched} not on it`}
            </p>
            <p className="mt-1 text-xs font-semibold">
              {result.overallBand === "within"
                ? "Overall, your pricing is in line with the rate table."
                : result.overallBand === "high"
                  ? "Overall, your pricing sits above the rate table."
                  : "Overall, your pricing sits below the rate table."}
            </p>
          </div>

          {result.outliers.length > 0 && (
            <ul className="space-y-1.5">
              {result.outliers.map((o) => (
                <li
                  key={o.itemId}
                  className={`rounded-lg border px-3 py-2 text-sm ${
                    o.direction === "low"
                      ? "border-rose-500/40 bg-rose-500/10 text-rose-800 dark:text-rose-300"
                      : "border-amber-500/40 bg-amber-400/10 text-amber-900 dark:text-amber-200"
                  }`}
                >
                  <strong>{o.description}</strong> ({o.unit}) — priced {bandLabels[o.band] ?? ""}{" "}
                  {o.direction === "high" ? "above" : "below"} the usual rate.
                </li>
              ))}
            </ul>
          )}

          {result.timelineNote && (
            <p className="rounded-lg bg-amber-400/15 px-3 py-2 text-xs font-semibold text-amber-900 dark:text-amber-200">
              {result.timelineNote}
            </p>
          )}

          {result.narrative && (
            <p className="text-sm whitespace-pre-wrap text-stone-700 dark:text-slate-300">
              {result.narrative}
            </p>
          )}

          <button
            type="button"
            onClick={() => void run()}
            disabled={busy}
            className="text-xs font-bold text-amber-700 hover:underline disabled:opacity-50 dark:text-amber-400"
          >
            Check again
          </button>
        </div>
      )}
    </AiPanel>
  );
}
