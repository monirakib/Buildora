"use client";

import { useCallback, useEffect, useState } from "react";
import { Coins, RefreshCw, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import type { PriceRefreshRunSummary } from "@buildora/shared";
import { useSession } from "@/store/useSession";
import { AdminShell } from "@/components/admin/AdminShell";
import { PriceSheetSection } from "@/components/admin/PriceSheetSection";
import { timeAgo } from "@/components/admin/format";
import { getPricingStatus, triggerPriceRefresh } from "@/lib/apiAdmin";

const cardClass =
  "rounded-2xl border border-black/10 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5";

const STATUS_STYLE: Record<PriceRefreshRunSummary["status"], string> = {
  RUNNING: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  OK: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  PARTIAL: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
  FAILED: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
};

const TRIGGER_LABELS: Record<PriceRefreshRunSummary["trigger"], string> = {
  CRON: "Weekly timer",
  ENDPOINT: "External scheduler",
  ADMIN: "Admin button",
  LAZY: "Opened an estimate",
  SEED: "Seed script",
  IMPORT: "CSV price sheet",
};

/**
 * Material pricing.
 *
 * Two halves. The top is the price sheet an admin maintains by hand — the CSV
 * they download, edit and upload each week, plus row-by-row editing for the
 * weeks when only one number moved. The bottom is the automatic side: the
 * marketplace medians and manufacturer pages the weekly job reads, and the log
 * of what each run actually did.
 *
 * The weekly refresh that keeps material prices current can't be trusted to
 * fire on its own on a free-tier instance that spins down when idle (see
 * services/priceCron) — so this is the button that actually guarantees it
 * happens: fetch the latest prices, then reprice every land owner's estimate
 * against them. Unlike the scheduled triggers this one is awaited end to end,
 * because a person is looking at the screen waiting for the result.
 */
export default function AdminPricingPage() {
  const token = useSession((s) => s.token);

  const [lastSuccessfulAt, setLastSuccessfulAt] = useState<string | null>(null);
  const [runs, setRuns] = useState<PriceRefreshRunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const res = await getPricingStatus(token);
      setLastSuccessfulAt(res.lastSuccessfulAt);
      setRuns(res.runs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load pricing status");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRefresh() {
    if (!token) return;
    setRefreshing(true);
    setError(null);
    try {
      await triggerPriceRefresh(token);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't refresh prices");
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <AdminShell
      title="Material pricing"
      subtitle="Keep the weekly price sheet current — the cost estimator prices every build against it"
    >
      <div className="space-y-6">
        {/* The sheet reloads the run log after an import, since an import
            writes a run of its own. */}
        <PriceSheetSection onChanged={load} />

        <div className="border-t border-black/5 pt-6 dark:border-white/10">
          <h2 className="text-sm font-extrabold text-stone-900 dark:text-white">
            Automatic sources
          </h2>
          <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
            Marketplace medians and manufacturer price pages, refreshed weekly. These supplement the
            sheet above; they never replace it.
          </p>
        </div>

        <section className={cardClass}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex gap-3">
              <Coins className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-400" />
              <div className="text-sm text-stone-600 dark:text-stone-300">
                <p className="font-bold text-stone-900 dark:text-white">
                  This runs the weekly refresh right now, on demand.
                </p>
                <p className="mt-1">
                  It re-fetches marketplace medians and manufacturer prices, embeds anything new,
                  then walks every project and recalculates its cost estimate against the updated
                  prices. Estimates already priced from a Bill of Quantities or contractor bids are
                  left alone — those are already real prices for that building, not something a
                  general market figure should overrule.
                </p>
                <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">
                  Last successful refresh: {lastSuccessfulAt ? timeAgo(lastSuccessfulAt) : "never"}
                </p>
              </div>
            </div>

            <button
              type="button"
              disabled={refreshing}
              onClick={handleRefresh}
              className="flex shrink-0 items-center gap-2 rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-extrabold text-stone-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              {refreshing ? "Fetching prices & recalculating…" : "Refresh prices now"}
            </button>
          </div>
        </section>

        {error && (
          <p className="rounded-xl bg-red-100 px-4 py-2.5 text-sm font-semibold text-red-700 dark:bg-red-500/15 dark:text-red-300">
            {error}
          </p>
        )}

        <section className={cardClass}>
          <h2 className="text-sm font-extrabold text-stone-900 dark:text-white">
            Recent refreshes
          </h2>
          {loading ? (
            <p className="mt-3 text-sm text-stone-500 dark:text-stone-400">Loading…</p>
          ) : runs.length === 0 ? (
            <p className="mt-3 text-sm text-stone-500 dark:text-stone-400">
              No refresh has run yet — press the button above to start the first one.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-black/5 dark:divide-white/5">
              {runs.map((r) => (
                <li key={r.id} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[0.65rem] font-extrabold ${STATUS_STYLE[r.status]}`}
                      >
                        {r.status}
                      </span>
                      <span className="text-sm font-bold text-stone-900 dark:text-white">
                        {TRIGGER_LABELS[r.trigger]}
                      </span>
                    </div>
                    <span className="text-[0.7rem] text-stone-400">{timeAgo(r.startedAt)}</span>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-stone-600 dark:text-stone-400">
                    <span>
                      {r.pricesWritten.toLocaleString()} price{r.pricesWritten === 1 ? "" : "s"}{" "}
                      written
                    </span>
                    <span>{r.pricesEmbedded.toLocaleString()} embedded</span>
                    {r.trigger === "ADMIN" && (
                      <span>
                        {r.estimatesUpdated.toLocaleString()} of{" "}
                        {r.estimatesChecked.toLocaleString()} estimate
                        {r.estimatesChecked === 1 ? "" : "s"} updated
                      </span>
                    )}
                  </div>

                  {r.sourcesOk.length > 0 && (
                    <p className="mt-1.5 flex items-center gap-1.5 text-[0.7rem] text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                      {r.sourcesOk.join(", ")}
                    </p>
                  )}
                  {r.sourcesFailed.length > 0 && (
                    <ul className="mt-1.5 space-y-1">
                      {r.sourcesFailed.map((f, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-1.5 text-[0.7rem] text-red-600 dark:text-red-400"
                        >
                          <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          {f.source}: {f.reason}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={`${cardClass} flex gap-3`}>
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-stone-400" />
          <p className="text-xs text-stone-500 dark:text-stone-400">
            Scraped manufacturer prices are written unapproved and this button doesn&apos;t approve
            them — they appear under &ldquo;Waiting for review&rdquo; above and can&apos;t move an
            estimate until you approve one. Marketplace medians are auto-approved: those are our own
            suppliers&apos; listed prices, which the marketplace already moderates.
          </p>
        </section>
      </div>
    </AdminShell>
  );
}
