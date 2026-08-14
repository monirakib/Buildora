"use client";

import { useState } from "react";
import type { BriefCheck, BriefCoachResult } from "@buildora/shared";
import { coachBrief, type BriefCoachInput } from "@/lib/apiAssistant";
import { AiPanel } from "@/components/assistant/AiPanel";

/**
 * "Check my brief" — the button under the brief form.
 *
 * Runs only when pressed. Everything numeric on screen was computed on the
 * server from the real DAP zone table; the paragraph at the bottom is the only
 * part written by a model, and it is simply absent when no model answered.
 */

const severityStyles: Record<BriefCheck["severity"], string> = {
  blocker: "border-rose-500/40 bg-rose-500/10 text-rose-800 dark:text-rose-300",
  warning: "border-amber-500/40 bg-amber-400/10 text-amber-900 dark:text-amber-200",
  tip: "border-black/10 bg-black/4 text-stone-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-300",
};

const severityLabels: Record<BriefCheck["severity"], string> = {
  blocker: "Blocker",
  warning: "Worth fixing",
  tip: "Tip",
};

function sqm(n: number) {
  return `${n.toLocaleString("en-US", { maximumFractionDigits: 0 })} m²`;
}

export function BriefCoachPanel({
  token,
  input,
  canRun,
}: {
  token: string;
  input: BriefCoachInput;
  /** False until the area is filled in — there is nothing to check without it. */
  canRun: boolean;
}) {
  const [result, setResult] = useState<BriefCoachResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      setResult(await coachBrief(token, input));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't check the brief");
    } finally {
      setBusy(false);
    }
  }

  if (!result && !busy && !error) {
    return (
      <button
        type="button"
        onClick={() => void run()}
        disabled={!canRun}
        className="w-full rounded-xl border border-amber-500/40 bg-amber-400/10 px-4 py-3 text-sm font-bold text-amber-800 transition hover:bg-amber-400/20 disabled:cursor-not-allowed disabled:opacity-50 dark:text-amber-300"
      >
        {canRun ? "Check my brief before posting" : "Fill in the area to check your brief"}
      </button>
    );
  }

  const blockers = result?.checks.filter((c) => c.severity === "blocker").length ?? 0;

  return (
    <AiPanel
      title="Brief check"
      subtitle={
        result
          ? blockers > 0
            ? `${blockers} thing${blockers === 1 ? "" : "s"} RAJUK would refuse`
            : `${result.checks.length} suggestion${result.checks.length === 1 ? "" : "s"}`
          : "Reading your brief against the zoning table"
      }
      busy={busy}
      error={error}
    >
      {result && (
        <div className="space-y-3">
          {/* The zone limits, straight from the database. */}
          {result.zone ? (
            <div className="rounded-xl border border-black/10 bg-white/50 px-3 py-2.5 text-sm dark:border-white/10 dark:bg-white/5">
              <p className="font-bold">
                {result.zone.zoneCode} · {result.zone.areaName}
              </p>
              <p className="mt-1 text-xs text-stone-600 dark:text-slate-400">
                Max FAR {result.zone.maxFar} · coverage {result.zone.maxGroundCoveragePct}%
                {result.zone.maxFloors ? ` · max ${result.zone.maxFloors} floors` : ""}
              </p>
              {result.maxFloorAreaSqm != null && (
                <p className="mt-1.5 text-xs text-stone-700 dark:text-slate-300">
                  Allows up to <strong>{sqm(result.maxFloorAreaSqm)}</strong> total floor area
                  {result.perFloorSqm != null && <> · about {sqm(result.perFloorSqm)} per floor</>}
                </p>
              )}
              {result.permitFeeBdt != null && (
                <p className="mt-1 text-xs text-stone-500 dark:text-slate-400">
                  Indicative RAJUK fee at that size: ৳{result.permitFeeBdt.toLocaleString("en-US")}
                </p>
              )}
            </div>
          ) : null}

          {result.checks.length === 0 ? (
            <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-800 dark:text-emerald-300">
              Nothing stands out. This brief looks ready to post.
            </p>
          ) : (
            <ul className="space-y-2">
              {result.checks.map((check) => (
                <li
                  key={check.id}
                  className={`rounded-lg border px-3 py-2 text-sm ${severityStyles[check.severity]}`}
                >
                  <span className="mr-1.5 text-[11px] font-extrabold uppercase opacity-70">
                    {severityLabels[check.severity]}
                  </span>
                  {check.text}
                </li>
              ))}
            </ul>
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
