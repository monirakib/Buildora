"use client";

import { useCallback, useEffect, useState } from "react";
import { Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { EstimateTier, type CostEstimate, type EstimateSnapshot } from "@buildora/shared";
import { estimateProject } from "@/lib/apiEstimator";
import { formatBdt } from "@/components/app/projectStatus";

const cardClass =
  "rounded-2xl border border-white/50 bg-white/55 p-5 shadow-xl shadow-black/5 backdrop-blur-xl sm:p-6 dark:border-white/10 dark:bg-white/5";

/**
 * The cost estimate.
 *
 * Two things are worth being clear about, because they're the parts people
 * assume are magic.
 *
 * **The numbers are not written by the AI.** Quantities and rates come from the
 * same admin-maintained BOQ table a contractor's tender is priced from, so the
 * estimate and the eventual bids are speaking about the same materials. The AI
 * only writes the explanation, and every figure stands without it.
 *
 * **It is shown as a range, never as one number.** How much the figure is worth
 * depends entirely on what it was calculated from — a guess off the plot size
 * deserves ±30%, prices contractors actually bid deserve ±5%. Showing a bare
 * midpoint would read as a quote, and it isn't one. The tier badge says which
 * rung this is, so nobody mistakes a first guess for a settled price.
 */

const tierStyles: Record<EstimateTier, string> = {
  [EstimateTier.PLOT_ONLY]: "bg-stone-500/15 text-stone-700 dark:text-slate-300",
  [EstimateTier.FLOOR_PLAN]: "bg-sky-500/15 text-sky-800 dark:text-sky-300",
  [EstimateTier.BOQ]: "bg-amber-500/20 text-amber-800 dark:text-amber-300",
  [EstimateTier.BID_BACKED]: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
};

export function EstimateSection({ projectId, token }: { projectId: string; token: string }) {
  const [estimate, setEstimate] = useState<CostEstimate | null>(null);
  const [tierLabel, setTierLabel] = useState("");
  const [history, setHistory] = useState<EstimateSnapshot[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showLines, setShowLines] = useState(false);

  const run = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await estimateProject(token, projectId);
      setEstimate(res.estimate);
      setTierLabel(res.tierLabel);
      setHistory(res.history);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't build the estimate");
    } finally {
      setBusy(false);
    }
  }, [token, projectId]);

  // The estimate already exists — it's recalculated whenever the project gains
  // real data — so this is a read on open, not a calculation the user triggers.
  useEffect(() => {
    void run();
  }, [run]);

  return (
    <section>
      <h2 className="text-xl font-extrabold tracking-tight">Cost estimate</h2>
      <div className={`mt-4 ${cardClass}`}>
        {error && (
          <p className="mb-4 rounded-xl bg-rose-100 px-4 py-2.5 text-sm font-medium text-rose-800 dark:bg-rose-400/15 dark:text-rose-300">
            {error}
          </p>
        )}

        {!estimate ? (
          <p className="text-sm text-stone-600 dark:text-slate-400">
            {busy ? "Working out the estimate…" : "No estimate yet."}
          </p>
        ) : (
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                {/* The range, not a midpoint — see the note at the top of this file. */}
                <p className="text-3xl font-extrabold">
                  {formatBdt(estimate.rangeLowBdt)} – {formatBdt(estimate.rangeHighBdt)}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-stone-600 dark:text-slate-400">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${tierStyles[estimate.tier]}`}
                  >
                    {tierLabel}
                  </span>
                  <span>
                    {estimate.areaSqft.toLocaleString()} sqft · {formatBdt(estimate.perSqftBdt)} per
                    sqft
                  </span>
                </p>
                <p className="mt-1 text-xs text-stone-500 dark:text-slate-500">
                  Based on {estimate.areaSource}.
                </p>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => void run()}
                className="rounded-full border border-stone-300 px-5 py-2 text-sm font-bold text-stone-700 transition hover:bg-stone-100 disabled:opacity-60 dark:border-white/20 dark:text-slate-200 dark:hover:bg-white/10"
              >
                Refresh
              </button>
            </div>

            {/* How the figure has moved as the project gained real detail. */}
            {history.length > 1 && (
              <div className="rounded-xl border border-black/10 px-4 py-3 dark:border-white/10">
                <p className="text-xs font-bold tracking-wider text-stone-500 uppercase dark:text-slate-400">
                  How this estimate has tightened
                </p>
                <ul className="mt-2 space-y-1 text-sm">
                  {history.map((h) => (
                    <li key={h.id} className="flex flex-wrap justify-between gap-2">
                      <span className="text-stone-600 dark:text-slate-400">
                        {h.createdAt.slice(0, 10)}
                      </span>
                      <span className="font-semibold">
                        {formatBdt(h.rangeLowBdt)} – {formatBdt(h.rangeHighBdt)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/*
              Live supplier listings, reported and never applied. A marketplace
              price is per-unit material; a BOQ rate is composite work. Nothing
              here changes the figures above.
            */}
            {estimate.drift && estimate.drift.categories.some((c) => c.changePct != null) && (
              <div className="rounded-xl bg-black/4 px-4 py-3 dark:bg-white/5">
                <p className="text-xs font-bold tracking-wider text-stone-500 uppercase dark:text-slate-400">
                  Supplier prices on Buildora
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {estimate.drift.categories
                    .filter((c) => c.changePct != null && Math.abs(c.changePct) >= 1)
                    .slice(0, 6)
                    .map((c) => (
                      <span
                        key={c.category}
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                          c.changePct! > 0
                            ? "bg-rose-500/12 text-rose-700 dark:text-rose-300"
                            : "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
                        }`}
                      >
                        {c.changePct! > 0 ? (
                          <TrendingUp className="h-3 w-3" />
                        ) : (
                          <TrendingDown className="h-3 w-3" />
                        )}
                        {c.category.toLowerCase().replace(/_/g, " ")} {c.changePct! > 0 ? "+" : ""}
                        {c.changePct}% ({c.listings})
                      </span>
                    ))}
                </div>
                <p className="mt-2 text-xs text-stone-500 dark:text-slate-500">
                  Median listing prices since your last estimate. Shown as a signal only, and not
                  applied to the figures above: a bag of cement and a rate for finished concrete
                  work are different things.
                </p>
              </div>
            )}

            {/* Category subtotals with a proportional bar — where the money goes */}
            <div className="flex flex-col gap-2">
              {estimate.byCategory
                .slice()
                .sort((a, b) => b.totalBdt - a.totalBdt)
                .map((c) => (
                  <div key={c.category}>
                    <div className="flex justify-between text-sm">
                      <span className="font-semibold">{c.category}</span>
                      <span className="text-stone-600 dark:text-slate-400">
                        {formatBdt(c.totalBdt)}
                      </span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                      <div
                        className="h-full rounded-full bg-amber-400"
                        style={{
                          width: `${estimate.totalBdt > 0 ? (c.totalBdt / estimate.totalBdt) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
            </div>

            {estimate.narrative && (
              <div className="rounded-xl bg-amber-400/10 px-4 py-3">
                <p className="mb-1.5 inline-flex items-center gap-1.5 text-xs font-bold tracking-wider text-amber-700 uppercase dark:text-amber-400">
                  <Sparkles className="h-3.5 w-3.5" /> What this means
                </p>
                <p className="text-sm whitespace-pre-line text-stone-700 dark:text-slate-300">
                  {estimate.narrative}
                </p>
              </div>
            )}

            <div>
              <button
                type="button"
                onClick={() => setShowLines((v) => !v)}
                className="text-sm font-bold text-amber-600 hover:underline dark:text-amber-400"
              >
                {showLines ? "Hide" : "Show"} all {estimate.lines.length} line items
              </button>
              {showLines && (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-stone-300/60 text-left dark:border-white/10">
                        <th className="py-2 font-semibold">Item</th>
                        <th className="py-2 text-right font-semibold">Qty</th>
                        <th className="py-2 text-right font-semibold">Rate</th>
                        <th className="py-2 text-right font-semibold">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {estimate.lines.map((l, i) => (
                        <tr
                          key={i}
                          className="border-b border-stone-200/60 dark:border-white/[0.06]"
                        >
                          <td className="py-1.5">{l.description}</td>
                          <td className="py-1.5 text-right whitespace-nowrap">
                            {l.quantity.toLocaleString()} {l.unit}
                          </td>
                          <td className="py-1.5 text-right">{l.ratePerUnitBdt}</td>
                          <td className="py-1.5 text-right font-semibold">
                            {l.totalBdt.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <p className="text-xs text-stone-500 dark:text-slate-500">
              Quantities and rates come from Buildora&apos;s BOQ table, the same rates your
              contractor tender is priced from, not from the AI. It is shown as a range because that
              is what it is: a budgeting guide, not a quote. The range narrows as the project gains
              real detail.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
