"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
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
 * estimate and the eventual bids are speaking about the same materials. Those
 * rates are then moved to today's real material prices in TypeScript, one slice
 * of a rate at a time — see services/repricing. The AI only writes the
 * explanation, and every figure stands without it.
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
                  How median listing prices have moved since your last estimate. This panel is a
                  trend, not an input — the figures above are adjusted from the specific prices
                  listed under &ldquo;priced from live material data&rdquo;, and only ever on the
                  material share of a rate.
                </p>
              </div>
            )}

            {/*
              The prices this figure was actually built from.

              Unlike the drift panel below-left, these HAVE been applied — each
              rate was split into material, labour and fixed slices and only the
              material slices were moved, so a cement rise touches the cement
              share of a concrete rate and nothing else. The fallback badge is
              the important part: an estimate that quietly substituted a stale
              price for a live one would be worse than one that admits it.
            */}
            {estimate.pricing && estimate.pricing.prices.length > 0 && (
              <div className="rounded-xl border border-black/10 px-4 py-3 dark:border-white/10">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-bold tracking-wider text-stone-500 uppercase dark:text-slate-400">
                    Priced from live material data
                  </p>
                  {estimate.pricing.usedFallback ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:text-amber-300">
                      <AlertTriangle className="h-3 w-3" />
                      {estimate.pricing.linesWithFallback} line
                      {estimate.pricing.linesWithFallback === 1 ? "" : "s"} on a fallback price
                    </span>
                  ) : (
                    <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                      All prices current
                    </span>
                  )}
                </div>

                <ul className="mt-2.5 space-y-1.5">
                  {estimate.pricing.prices.slice(0, 6).map((p) => (
                    <li
                      key={p.priceId}
                      className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm"
                    >
                      <span className="text-stone-700 dark:text-slate-300">
                        {p.itemLabel}
                        {p.resolution === "STALE_FALLBACK" && (
                          <span className="ml-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
                            stale
                          </span>
                        )}
                      </span>
                      <span className="text-stone-600 dark:text-slate-400">
                        {formatBdt(p.priceBdt)}/{p.unit}
                        <span className="ml-2 text-xs text-stone-500 dark:text-slate-500">
                          {p.sourceName} · {p.ageDays}d
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>

                <p className="mt-2 text-xs text-stone-500 dark:text-slate-500">
                  {estimate.pricing.linesRepriced} of the line items were adjusted from these
                  prices. Only the material share of each rate moves — wages and plant are costed
                  separately
                  {estimate.pricing.labourBasis
                    ? `, and wages were indexed over ${estimate.pricing.labourBasis}`
                    : ""}
                  .
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
                className="text-sm font-bold text-amber-700 hover:underline dark:text-amber-400"
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
