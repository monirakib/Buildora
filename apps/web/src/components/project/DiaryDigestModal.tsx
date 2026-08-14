"use client";

import { useEffect, useState } from "react";
import type { DiaryDigest } from "@buildora/shared";
import { getDiaryDigest } from "@/lib/apiAssistant";
import { AiPanel } from "@/components/assistant/AiPanel";

/**
 * "This week on site" — a week of the diary, counted and then read.
 *
 * Every figure comes from the diary entries themselves. The paragraph at the
 * bottom is the only written part, and it comments on those figures; when no
 * model answers, the counts stand on their own.
 */

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-black/10 bg-white/50 px-3 py-2 dark:border-white/10 dark:bg-white/5">
      <p className="text-xs text-stone-500 dark:text-slate-400">{label}</p>
      <p className="mt-0.5 text-lg font-extrabold tracking-tight">{value}</p>
    </div>
  );
}

export function DiaryDigestModal({
  token,
  projectId,
  onClose,
}: {
  token: string;
  projectId: string;
  onClose: () => void;
}) {
  const [digest, setDigest] = useState<DiaryDigest | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Which week is on screen; null means "the current one", and stepping back
  // sets an explicit date the server snaps to that week's Saturday.
  const [weekOf, setWeekOf] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    setError(null);
    getDiaryDigest(token, projectId, weekOf)
      .then((d) => !cancelled && setDigest(d))
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : "Failed"))
      .finally(() => !cancelled && setBusy(false));
    return () => {
      cancelled = true;
    };
  }, [token, projectId, weekOf]);

  // Escape closes, and the page behind doesn't scroll — same as the account
  // modal, so the two behave identically.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const busierThanLast =
    digest?.previousWeekLabourDays != null && digest.previousWeekLabourDays > 0
      ? digest.labourDays - digest.previousWeekLabourDays
      : null;

  return (
    <div
      role="dialog"
      aria-modal
      aria-label="Weekly site digest"
      onClick={onClose}
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/50 bg-white/90 p-5 shadow-2xl backdrop-blur-xl dark:border-white/10 dark:bg-stone-950/90"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold tracking-tight">This week on site</h2>
            {digest && (
              <p className="mt-0.5 text-xs text-stone-500 dark:text-slate-400">
                {digest.weekStart} to {digest.weekEnd} · Saturday to Friday
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg px-2 py-1 text-sm font-bold text-stone-500 hover:bg-black/5 dark:hover:bg-white/10"
          >
            ✕
          </button>
        </div>

        <AiPanel
          title="Weekly digest"
          subtitle={digest ? `${digest.daysLogged} of 7 days logged` : "Reading the diary"}
          busy={busy}
          error={error}
          footer="Counted from the diary entries. The written summary is guidance only."
        >
          {digest && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat label="Days logged" value={digest.daysLogged} />
                <Stat label="Labour-days" value={digest.labourDays} />
                <Stat label="Rain days" value={digest.rainDays} />
                <Stat label="Rainfall" value={`${digest.totalRainfallMm} mm`} />
              </div>

              {busierThanLast != null && (
                <p className="text-xs font-semibold text-stone-600 dark:text-slate-400">
                  {busierThanLast === 0
                    ? "Same labour as last week."
                    : busierThanLast > 0
                      ? `${busierThanLast} more labour-days than last week.`
                      : `${Math.abs(busierThanLast)} fewer labour-days than last week.`}
                </p>
              )}

              {digest.peakLabour && (
                <p className="text-xs text-stone-600 dark:text-slate-400">
                  Busiest day was {digest.peakLabour.date} with {digest.peakLabour.count} on site.
                </p>
              )}

              {digest.trades.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {digest.trades.map((t) => (
                    <span
                      key={t.trade}
                      className="rounded-full bg-black/5 px-2.5 py-1 text-[11px] font-semibold dark:bg-white/10"
                    >
                      {t.trade.toLowerCase().replace(/_/g, " ")} · {t.count}
                    </span>
                  ))}
                </div>
              )}

              {digest.materials.length > 0 && (
                <p className="text-xs text-stone-600 dark:text-slate-400">
                  Materials:{" "}
                  {digest.materials.map((m) => `${m.item} ${m.quantity} ${m.unit}`).join(", ")}
                </p>
              )}

              {digest.issueCount > 0 && (
                <p className="rounded-lg bg-amber-400/15 px-3 py-2 text-xs font-semibold text-amber-900 dark:text-amber-200">
                  Issues logged on {digest.issueCount} {digest.issueCount === 1 ? "day" : "days"}:{" "}
                  {digest.issueDates.join(", ")}
                </p>
              )}

              {digest.daysLogged === 0 && (
                <p className="text-sm text-stone-600 dark:text-slate-400">
                  Nothing was logged this week.
                </p>
              )}

              {digest.narrative && (
                <p className="text-sm whitespace-pre-wrap text-stone-700 dark:text-slate-300">
                  {digest.narrative}
                </p>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setWeekOf(shiftWeek(digest.weekStart, -7))}
                  className="rounded-lg border border-black/10 px-3 py-1.5 text-xs font-bold transition hover:bg-black/5 disabled:opacity-50 dark:border-white/15 dark:hover:bg-white/10"
                >
                  ← Previous week
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setWeekOf(shiftWeek(digest.weekStart, 7))}
                  className="rounded-lg border border-black/10 px-3 py-1.5 text-xs font-bold transition hover:bg-black/5 disabled:opacity-50 dark:border-white/15 dark:hover:bg-white/10"
                >
                  Next week →
                </button>
              </div>
            </div>
          )}
        </AiPanel>
      </div>
    </div>
  );
}

/** Steps a "YYYY-MM-DD" key by whole days, staying in that format. */
function shiftWeek(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
