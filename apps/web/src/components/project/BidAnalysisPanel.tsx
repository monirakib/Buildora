"use client";

import { useState } from "react";
import type { BidAnalysis, BidAnalysisEntry, BidRiskFlag } from "@buildora/shared";
import { analyseBids } from "@/lib/apiTenders";
import { AiPanel } from "@/components/assistant/AiPanel";
import { formatBdt } from "@/components/app/projectStatus";

/**
 * "Read these bids for me" — the owner's side of bid comparison.
 *
 * The table above this already shows what each contractor quoted. This says
 * what it means: which lines are priced under cost, whose timeline is out of
 * step with everyone else's, and whether any bid is front-loaded so the money
 * leaves escrow before the work is done.
 *
 * Every flag is arithmetic, decided on the server. The paragraph is the only
 * written part, and it is framed as questions to ask rather than conclusions to
 * draw — these are real professionals, and a low price is far more often a
 * leaner crew than anything worse.
 */

const flagLabels: Record<BidRiskFlag, string> = {
  BELOW_COST_OVERALL: "Below cost overall",
  LINES_UNDERWATER: "Lines under cost",
  TIMELINE_OPTIMISTIC: "Timeline much faster than others",
  SINGLE_LINE_LOADED: "Front-loaded onto one line",
  LOW_RATING: "Low platform rating",
};

const flagStyles: Record<BidRiskFlag, string> = {
  BELOW_COST_OVERALL: "bg-rose-500/15 text-rose-800 dark:text-rose-300",
  LINES_UNDERWATER: "bg-rose-500/12 text-rose-800 dark:text-rose-300",
  TIMELINE_OPTIMISTIC: "bg-amber-500/15 text-amber-900 dark:text-amber-200",
  SINGLE_LINE_LOADED: "bg-amber-500/20 text-amber-900 dark:text-amber-200",
  LOW_RATING: "bg-stone-500/15 text-stone-700 dark:text-slate-300",
};

const marginLabels: Record<BidAnalysisEntry["margin"], string> = {
  underwater: "priced below cost",
  thin: "thin margin",
  normal: "normal margin",
  rich: "well above the guide",
};

export function BidAnalysisPanel({ token, tenderId }: { token: string; tenderId: string }) {
  const [analysis, setAnalysis] = useState<BidAnalysis | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      setAnalysis(await analyseBids(token, tenderId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read the bids");
    } finally {
      setBusy(false);
    }
  }

  if (!analysis && !busy && !error) {
    return (
      <button
        type="button"
        onClick={() => void run()}
        className="mt-4 w-full rounded-xl border border-amber-500/40 bg-amber-400/10 px-4 py-3 text-sm font-bold text-amber-800 transition hover:bg-amber-400/20 dark:text-amber-300"
      >
        Read these bids for me
      </button>
    );
  }

  return (
    <div className="mt-4">
      <AiPanel
        title="Bid analysis"
        subtitle={
          analysis
            ? `${analysis.bids.length} bid${analysis.bids.length === 1 ? "" : "s"}, cheapest first`
            : "Comparing the bids"
        }
        busy={busy}
        error={error}
        footer="Guidance only. Which bid to accept is your decision."
      >
        {analysis && (
          <div className="space-y-3">
            {(analysis.guideTotalBdt != null || analysis.estimateTotalBdt != null) && (
              <p className="text-xs text-stone-600 dark:text-slate-400">
                {analysis.guideTotalBdt != null && (
                  <>Your guide total: {formatBdt(analysis.guideTotalBdt)}. </>
                )}
                {analysis.estimateTotalBdt != null && (
                  <>Your estimate before bidding: {formatBdt(analysis.estimateTotalBdt)}.</>
                )}
              </p>
            )}

            {analysis.bids.map((bid) => (
              <div
                key={bid.bidId}
                className="rounded-xl border border-black/10 bg-white/50 px-3 py-2.5 dark:border-white/10 dark:bg-white/5"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-bold">{bid.contractorName}</p>
                  <p className="text-sm font-extrabold">{formatBdt(bid.totalBdt)}</p>
                </div>
                <p className="mt-0.5 text-xs text-stone-600 dark:text-slate-400">
                  {bid.timelineWeeks} weeks · {marginLabels[bid.margin]}
                  {bid.vsGuideTotalPct != null && (
                    <>
                      {" "}
                      · {bid.vsGuideTotalPct > 0 ? "+" : ""}
                      {bid.vsGuideTotalPct}% vs your guide
                    </>
                  )}
                </p>

                {bid.riskFlags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {bid.riskFlags.map((flag) => (
                      <span
                        key={flag}
                        className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${flagStyles[flag]}`}
                      >
                        {flagLabels[flag]}
                        {flag === "LINES_UNDERWATER" && ` (${bid.underwaterLines})`}
                      </span>
                    ))}
                  </div>
                )}

                {bid.notableLines.length > 0 && (
                  <ul className="mt-2 space-y-0.5 text-xs text-stone-600 dark:text-slate-400">
                    {bid.notableLines.map((line) => (
                      <li key={line.itemId}>
                        {line.description}: {formatBdt(line.bidRateBdt)}/{line.unit}
                        {line.guideRateBdt != null && <> vs guide {formatBdt(line.guideRateBdt)}</>}
                        {line.vsGuidePct != null && (
                          <span
                            className={
                              line.vsGuidePct < 0
                                ? "font-bold text-rose-600 dark:text-rose-400"
                                : "font-bold text-amber-700 dark:text-amber-400"
                            }
                          >
                            {" "}
                            ({line.vsGuidePct > 0 ? "+" : ""}
                            {line.vsGuidePct}%)
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}

            {analysis.narrative && (
              <p className="text-sm whitespace-pre-wrap text-stone-700 dark:text-slate-300">
                {analysis.narrative}
              </p>
            )}
          </div>
        )}
      </AiPanel>
    </div>
  );
}
