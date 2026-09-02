"use client";

import { useCallback, useEffect, useState } from "react";
import { MapPin, TriangleAlert, UserCheck, X } from "lucide-react";
import { LabourTrade, SITE_RADIUS_M } from "@buildora/shared";
import {
  checkIn as apiCheckIn,
  checkOut as apiCheckOut,
  currentPosition,
  deleteCheckIn,
  listAttendance,
  type AttendanceDay,
} from "@/lib/apiAttendance";

const cardClass =
  "rounded-2xl border border-white/50 bg-white/55 p-5 shadow-xl shadow-black/5 backdrop-blur-xl sm:p-6 dark:border-white/10 dark:bg-white/5";
const inputClass =
  "block w-full rounded-xl border border-stone-300/80 bg-white/70 px-4 py-2.5 text-sm outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-400/30 dark:border-white/15 dark:bg-white/5 dark:text-slate-100";

const tradeLabels: Record<LabourTrade, string> = {
  [LabourTrade.MASON]: "Mason",
  [LabourTrade.HELPER]: "Helper",
  [LabourTrade.STEEL_FIXER]: "Steel fixer",
  [LabourTrade.CARPENTER]: "Carpenter",
  [LabourTrade.ELECTRICIAN]: "Electrician",
  [LabourTrade.PLUMBER]: "Plumber",
  [LabourTrade.PAINTER]: "Painter",
  [LabourTrade.OPERATOR]: "Operator",
  [LabourTrade.SUPERVISOR]: "Supervisor",
  [LabourTrade.OTHER]: "Other",
};

/**
 * Site check-in.
 *
 * The diary's headcount is typed from memory at the end of the day; this is the
 * same number captured on the plot as the crew arrives, with the phone's
 * coordinates attached. Being outside the radius doesn't block the record — GPS
 * under a concrete slab is wrong often enough that refusing would just make
 * people stop using it — so an off-site record is flagged and kept.
 */
export function AttendanceSection({
  projectId,
  token,
  hasPlotPin,
}: {
  projectId: string;
  token: string;
  /** Without a pin there is nothing to measure against, and the UI says so. */
  hasPlotPin: boolean;
}) {
  const [day, setDay] = useState<AttendanceDay | null>(null);
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ trade: LabourTrade.MASON, count: "1", note: "" });

  const load = useCallback(async () => {
    try {
      const result = await listAttendance(token, projectId, date || undefined);
      setDay(result);
      if (!date) setDate(result.summary.date);
    } catch {
      setDay(null);
    }
  }, [token, projectId, date]);

  useEffect(() => {
    load();
  }, [load]);

  async function record() {
    setBusy(true);
    setError(null);
    try {
      // The fix is taken here, at the moment of check-in, rather than being
      // held from an earlier read — a stale position would defeat the point.
      const pos = await currentPosition();
      await apiCheckIn(token, projectId, {
        trade: form.trade,
        count: Number(form.count || 1),
        lat: pos.lat,
        lng: pos.lng,
        note: form.note || undefined,
      });
      setForm({ trade: LabourTrade.MASON, count: "1", note: "" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't check in");
    } finally {
      setBusy(false);
    }
  }

  const summary = day?.summary;

  return (
    <section>
      <h2 className="text-xl font-extrabold tracking-tight">Site attendance</h2>
      <div className={`mt-4 ${cardClass}`}>
        {error && (
          <p className="mb-4 rounded-xl bg-rose-100 px-4 py-2.5 text-sm font-medium text-rose-800 dark:bg-rose-400/15 dark:text-rose-300">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-3xl font-extrabold">{summary?.headcount ?? 0}</p>
            <p className="text-xs text-stone-500 dark:text-slate-500">
              on site{summary ? ` on ${summary.date}` : ""}
            </p>
          </div>
          <label className="text-sm">
            <span className="mb-1 block font-semibold">Day</span>
            <input
              type="date"
              className={inputClass}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
        </div>

        {summary && summary.byTrade.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {summary.byTrade.map((t) => (
              <span
                key={t.trade}
                className="rounded-full bg-amber-400/15 px-3 py-1 text-xs font-bold text-amber-700 dark:text-amber-300"
              >
                {tradeLabels[t.trade]} × {t.count}
              </span>
            ))}
          </div>
        )}

        {summary && summary.offSiteRecords > 0 && (
          <p className="mt-3 inline-flex items-start gap-2 rounded-xl bg-amber-100 px-4 py-2.5 text-xs text-amber-900 dark:bg-amber-400/15 dark:text-amber-200">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {summary.offSiteRecords} record{summary.offSiteRecords === 1 ? " was" : "s were"} taken
            more than {SITE_RADIUS_M} m from the plot pin.
          </p>
        )}

        {/* Records */}
        {day && day.checkIns.length > 0 && (
          <ul className="mt-4 flex flex-col gap-2">
            {day.checkIns.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-stone-300/60 px-4 py-2.5 text-sm dark:border-white/10"
              >
                <UserCheck
                  className={`h-4 w-4 shrink-0 ${c.onSite ? "text-emerald-500" : "text-amber-500"}`}
                />
                <span className="font-semibold">
                  {tradeLabels[c.trade]} × {c.count}
                </span>
                <span className="text-xs text-stone-500 dark:text-slate-500">
                  {c.recordedBy.name} ·{" "}
                  {new Date(c.checkedInAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {c.checkedOutAt
                    ? ` – ${new Date(c.checkedOutAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                    : ""}
                </span>
                {c.distanceFromPlotM != null && (
                  <span
                    className={`inline-flex items-center gap-1 text-xs ${
                      c.onSite
                        ? "text-stone-500 dark:text-slate-500"
                        : "font-bold text-amber-700 dark:text-amber-400"
                    }`}
                  >
                    <MapPin className="h-3 w-3" />
                    {c.distanceFromPlotM} m
                  </span>
                )}
                {c.note && (
                  <span className="text-xs text-stone-600 dark:text-slate-400">{c.note}</span>
                )}
                <span className="ml-auto flex gap-2">
                  {!c.checkedOutAt && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await apiCheckOut(token, projectId, c.id);
                          await load();
                        } finally {
                          setBusy(false);
                        }
                      }}
                      className="text-xs font-bold text-amber-700 hover:underline dark:text-amber-400"
                    >
                      Check out
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label="Remove record"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await deleteCheckIn(token, projectId, c.id);
                        await load();
                      } catch (err) {
                        setError(err instanceof Error ? err.message : "Couldn't remove it");
                      } finally {
                        setBusy(false);
                      }
                    }}
                    className="text-stone-400 transition hover:text-rose-600"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}

        {/* Check in */}
        <div className="mt-5 grid gap-3 border-t border-stone-300/60 pt-4 sm:grid-cols-[1fr_6rem_1fr_auto] dark:border-white/10">
          <label className="text-sm">
            <span className="mb-1 block font-semibold">Trade</span>
            <select
              className={inputClass}
              value={form.trade}
              onChange={(e) => setForm({ ...form, trade: e.target.value as LabourTrade })}
            >
              {Object.values(LabourTrade).map((t) => (
                <option key={t} value={t}>
                  {tradeLabels[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-semibold">How many</span>
            <input
              type="number"
              min={1}
              className={inputClass}
              value={form.count}
              onChange={(e) => setForm({ ...form, count: e.target.value })}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-semibold">Note</span>
            <input
              className={inputClass}
              placeholder="Optional"
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={record}
            className="self-end rounded-full bg-amber-400 px-6 py-2.5 text-sm font-bold text-stone-950 transition hover:bg-amber-300 disabled:opacity-60"
          >
            {busy ? "Locating…" : "Check in"}
          </button>
        </div>

        <p className="mt-2 text-xs text-stone-500 dark:text-slate-500">
          {hasPlotPin
            ? `Your location is recorded with each check-in and compared to the plot pin. Anything beyond ${SITE_RADIUS_M} m is flagged, not blocked.`
            : "This project has no plot pin, so check-ins are recorded without a distance check. Add a pin to the brief to enable it."}
        </p>
      </div>
    </section>
  );
}
