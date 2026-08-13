"use client";

import { useState } from "react";
import { Calculator, Sparkles } from "lucide-react";
import type { CostEstimate } from "@buildora/shared";
import { estimateProject } from "@/lib/apiEstimator";
import { formatBdt } from "@/components/app/projectStatus";

const cardClass =
  "rounded-2xl border border-white/50 bg-white/55 p-5 shadow-xl shadow-black/5 backdrop-blur-xl sm:p-6 dark:border-white/10 dark:bg-white/5";
const inputClass =
  "block w-full rounded-xl border border-stone-300/80 bg-white/70 px-4 py-2.5 text-sm outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-400/30 dark:border-white/15 dark:bg-white/5 dark:text-slate-100";

/**
 * The cost and material estimate.
 *
 * Worth being clear about, because it's the part people assume is magic: the
 * numbers are not written by the AI. Every quantity and rate comes from the
 * same admin-maintained BOQ table a contractor's tender is built from, so the
 * estimate and the eventual bids are speaking about the same materials. The AI
 * only writes the explanation underneath, and the figures stand without it.
 */
export function EstimateSection({ projectId, token }: { projectId: string; token: string }) {
  const [estimate, setEstimate] = useState<CostEstimate | null>(null);
  const [areaSqft, setAreaSqft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLines, setShowLines] = useState(false);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      setEstimate(await estimateProject(token, projectId, areaSqft ? Number(areaSqft) : undefined));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't build the estimate");
    } finally {
      setBusy(false);
    }
  }

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
          <div>
            <p className="text-sm text-stone-600 dark:text-slate-400">
              A materials-and-labour estimate priced from Buildora&apos;s rate table. Leave the area
              blank to use your drawn floor plan, or type one to try a different size.
            </p>
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <label className="text-sm">
                <span className="mb-1 block font-semibold">Total floor area (sqft)</span>
                <input
                  className={inputClass}
                  type="number"
                  placeholder="From your floor plan"
                  value={areaSqft}
                  onChange={(e) => setAreaSqft(e.target.value)}
                />
              </label>
              <button
                type="button"
                disabled={busy}
                onClick={run}
                className="inline-flex items-center gap-2 rounded-full bg-amber-400 px-6 py-2.5 text-sm font-bold text-stone-950 transition hover:bg-amber-300 disabled:opacity-60"
              >
                <Calculator className="h-4 w-4" />
                {busy ? "Working…" : "Estimate"}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-3xl font-extrabold">{formatBdt(estimate.totalBdt)}</p>
                <p className="mt-0.5 text-sm text-stone-600 dark:text-slate-400">
                  {estimate.areaSqft.toLocaleString()} sqft · {formatBdt(estimate.perSqftBdt)} per
                  sqft
                </p>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={run}
                className="rounded-full border border-stone-300 px-5 py-2 text-sm font-bold text-stone-700 transition hover:bg-stone-100 disabled:opacity-60 dark:border-white/20 dark:text-slate-200 dark:hover:bg-white/10"
              >
                Recalculate
              </button>
            </div>

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
              contractor tender is priced from, not from the AI. Treat it as a budgeting guide, not
              a quote.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
