"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DEFAULT_AVAILABILITY,
  SLOT_MINUTE_OPTIONS,
  UserRole,
  WEEKDAY_LABELS,
  minutesFromHhmm,
  timeLabel,
  type Availability,
  type AvailabilityRule,
} from "@buildora/shared";
import { getMyAvailability, saveMyAvailability } from "@/lib/apiMeetings";
import { useSession } from "@/store/useSession";
import { Navbar } from "@/components/landing/Navbar";
import { surfaceBodyClass, surfaceClass, surfaceHeaderClass } from "@/components/ui/surface";

const inputClass =
  "block w-full rounded-xl border border-stone-300/80 bg-white/70 px-4 py-2.5 text-sm text-stone-900 placeholder-stone-400 backdrop-blur transition outline-none focus:border-amber-500 focus:bg-white/90 focus:ring-2 focus:ring-amber-400/30 dark:border-white/15 dark:bg-white/5 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:bg-white/10";

const labelClass = "mb-1.5 block text-sm font-semibold";

const hintClass = "mt-1.5 text-xs font-medium text-stone-600 dark:text-slate-400";

/** Today in Dhaka, as the min for the blackout date input. */
function todayInDhaka(): string {
  return new Date(Date.now() + 6 * 60 * 60_000).toISOString().slice(0, 10);
}

export default function AvailabilityPage() {
  const router = useRouter();
  const user = useSession((s) => s.user);
  const token = useSession((s) => s.token);

  const [form, setForm] = useState<Availability>(DEFAULT_AVAILABILITY);
  const [officeAddress, setOfficeAddress] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [newBlackout, setNewBlackout] = useState("");

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted) return;
    if (!user || !token) {
      router.replace("/auth");
      return;
    }
    if (user.role !== UserRole.ARCHITECT) {
      router.replace("/meetings");
      return;
    }
    getMyAvailability(token)
      .then((res) => {
        setForm(res.availability);
        setOfficeAddress(res.officeAddress);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load your hours"))
      .finally(() => setLoading(false));
  }, [mounted, user, token, router]);

  /** Every edit clears the "Saved" flag so the button never lies. */
  function update(patch: Partial<Availability>) {
    setForm((prev) => ({ ...prev, ...patch }));
    setSaved(false);
  }

  function addBlock(weekday: number) {
    update({ rules: [...form.rules, { weekday, start: "10:00", end: "13:00" }] });
  }

  function editBlock(index: number, patch: Partial<AvailabilityRule>) {
    update({ rules: form.rules.map((r, i) => (i === index ? { ...r, ...patch } : r)) });
  }

  function removeBlock(index: number) {
    update({ rules: form.rules.filter((_, i) => i !== index) });
  }

  function addBlackout() {
    const date = newBlackout.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || form.blackoutDates.includes(date)) return;
    update({ blackoutDates: [...form.blackoutDates, date].sort() });
    setNewBlackout("");
  }

  async function handleSave() {
    if (!token) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await saveMyAvailability(token, {
        slotMinutes: form.slotMinutes,
        rules: form.rules,
        blackoutDates: form.blackoutDates,
        minNoticeHours: form.minNoticeHours,
        maxAdvanceDays: form.maxAdvanceDays,
        published: form.published,
      });
      setForm(saved);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save your hours");
    } finally {
      setSaving(false);
    }
  }

  // A block whose end isn't after its start would be rejected by the API — catch
  // it here so the architect sees which row is wrong instead of one error.
  const badBlock = form.rules.findIndex(
    (r) => !(minutesFromHhmm(r.end) > minutesFromHhmm(r.start))
  );

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col">
        <Navbar />
        <main className="flex-1 px-5 pt-28 sm:px-8">
          <p className="mx-auto max-w-3xl text-sm text-stone-500 dark:text-slate-500">Loading…</p>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="flex-1 px-5 pt-28 pb-16 sm:px-8">
        <div className="mx-auto w-full max-w-3xl">
          <p className="text-sm font-bold tracking-[0.2em] text-amber-600 uppercase dark:text-amber-400">
            Meetings
          </p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">
            When can clients book you?
          </h1>
          <p className="mt-3 text-sm text-stone-600 dark:text-slate-400">
            Land owners see these hours split into slots, with anything already booked taken out.
            All times are Bangladesh Standard Time.
          </p>

          {/* ---- Weekly hours ---- */}
          <div className={`mt-8 ${surfaceClass}`}>
            <div className={surfaceHeaderClass}>
              <h2 className="text-base font-extrabold tracking-tight">Weekly hours</h2>
              <div>
                <label className="text-xs font-semibold" htmlFor="slotMinutes">
                  Meeting length
                </label>
                <select
                  id="slotMinutes"
                  value={form.slotMinutes}
                  onChange={(e) => update({ slotMinutes: Number(e.target.value) })}
                  className="ml-2 rounded-lg border border-stone-300/80 bg-white/70 px-2 py-1 text-xs font-semibold dark:border-white/15 dark:bg-white/5"
                >
                  {SLOT_MINUTE_OPTIONS.map((m) => (
                    <option key={m} value={m}>
                      {m} min
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className={surfaceBodyClass}>
              <div className="flex flex-col gap-4">
                {WEEKDAY_LABELS.map((label, weekday) => {
                  // Keep the original index so edits target the right rule.
                  const blocks = form.rules
                    .map((rule, index) => ({ rule, index }))
                    .filter(({ rule }) => rule.weekday === weekday);

                  return (
                    <div
                      key={label}
                      className="flex flex-col gap-2 border-b border-black/5 pb-4 last:border-0 last:pb-0 sm:flex-row sm:items-start dark:border-white/10"
                    >
                      <p className="w-28 shrink-0 pt-1.5 text-sm font-bold">{label}</p>

                      <div className="flex-1">
                        {blocks.length === 0 ? (
                          <p className="pt-1.5 text-sm text-stone-500 dark:text-slate-500">
                            Not available
                          </p>
                        ) : (
                          <div className="flex flex-col gap-2">
                            {blocks.map(({ rule, index }) => (
                              <div key={index} className="flex flex-wrap items-center gap-2">
                                <input
                                  type="time"
                                  value={rule.start}
                                  onChange={(e) => editBlock(index, { start: e.target.value })}
                                  className="rounded-lg border border-stone-300/80 bg-white/70 px-2.5 py-1.5 text-sm dark:border-white/15 dark:bg-white/5"
                                />
                                <span className="text-sm text-stone-500">to</span>
                                <input
                                  type="time"
                                  value={rule.end}
                                  onChange={(e) => editBlock(index, { end: e.target.value })}
                                  className="rounded-lg border border-stone-300/80 bg-white/70 px-2.5 py-1.5 text-sm dark:border-white/15 dark:bg-white/5"
                                />
                                <span className="text-xs text-stone-500 dark:text-slate-500">
                                  {timeLabel(rule.start)} – {timeLabel(rule.end)}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => removeBlock(index)}
                                  className="text-xs font-bold text-rose-600 hover:underline dark:text-rose-400"
                                >
                                  Remove
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => addBlock(weekday)}
                          className="mt-2 text-xs font-bold text-amber-700 hover:underline dark:text-amber-400"
                        >
                          + Add a block
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {badBlock >= 0 && (
                <p className="mt-4 rounded-xl bg-rose-100 px-4 py-2.5 text-sm font-medium text-rose-800 dark:bg-rose-400/15 dark:text-rose-300">
                  One of your {WEEKDAY_LABELS[form.rules[badBlock]!.weekday]} blocks ends before it
                  starts.
                </p>
              )}
            </div>
          </div>

          {/* ---- Booking window ---- */}
          <div className={`mt-6 ${surfaceClass}`}>
            <div className={surfaceHeaderClass}>
              <h2 className="text-base font-extrabold tracking-tight">Booking window</h2>
            </div>
            <div className={`${surfaceBodyClass} grid gap-4 sm:grid-cols-2`}>
              <div>
                <label className={labelClass} htmlFor="minNotice">
                  Shortest notice
                </label>
                <input
                  id="minNotice"
                  type="number"
                  min={0}
                  max={168}
                  value={form.minNoticeHours}
                  onChange={(e) => update({ minNoticeHours: Number(e.target.value) })}
                  className={inputClass}
                />
                <p className={hintClass}>
                  Hours. Nobody can book a slot sooner than this from now.
                </p>
              </div>
              <div>
                <label className={labelClass} htmlFor="maxAdvance">
                  How far ahead
                </label>
                <input
                  id="maxAdvance"
                  type="number"
                  min={1}
                  max={180}
                  value={form.maxAdvanceDays}
                  onChange={(e) => update({ maxAdvanceDays: Number(e.target.value) })}
                  className={inputClass}
                />
                <p className={hintClass}>Days of calendar a client can see.</p>
              </div>
            </div>
          </div>

          {/* ---- Days off ---- */}
          <div className={`mt-6 ${surfaceClass}`}>
            <div className={surfaceHeaderClass}>
              <h2 className="text-base font-extrabold tracking-tight">Days off</h2>
            </div>
            <div className={surfaceBodyClass}>
              <div className="flex flex-wrap items-end gap-2">
                <input
                  type="date"
                  min={todayInDhaka()}
                  value={newBlackout}
                  onChange={(e) => setNewBlackout(e.target.value)}
                  className="rounded-xl border border-stone-300/80 bg-white/70 px-3 py-2 text-sm dark:border-white/15 dark:bg-white/5"
                />
                <button
                  type="button"
                  onClick={addBlackout}
                  className="rounded-full border border-stone-300/80 px-4 py-2 text-xs font-bold transition hover:border-amber-400/60 dark:border-white/15"
                >
                  Add
                </button>
              </div>

              {form.blackoutDates.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {form.blackoutDates.map((date) => (
                    <li
                      key={date}
                      className="flex items-center gap-2 rounded-full bg-stone-200/70 px-3 py-1 text-xs font-semibold dark:bg-white/10"
                    >
                      {date}
                      <button
                        type="button"
                        onClick={() =>
                          update({ blackoutDates: form.blackoutDates.filter((d) => d !== date) })
                        }
                        className="text-rose-600 dark:text-rose-400"
                        aria-label={`Remove ${date}`}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p className={hintClass}>
                Holidays or leave. These days disappear from your calendar entirely.
              </p>
            </div>
          </div>

          {/* ---- Publish ---- */}
          <div className={`mt-6 ${surfaceClass}`}>
            <div className={surfaceBodyClass}>
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={form.published}
                  onChange={(e) => update({ published: e.target.checked })}
                  className="mt-1 size-4 accent-amber-500"
                />
                <span>
                  <span className="block text-sm font-bold">Open my calendar for booking</span>
                  <span className="mt-0.5 block text-xs text-stone-600 dark:text-slate-400">
                    Until this is on, nobody sees these hours and no one can book you.
                  </span>
                </span>
              </label>

              {!officeAddress && (
                <p className="mt-4 rounded-xl bg-amber-100 px-4 py-3 text-sm text-amber-900 dark:bg-amber-400/15 dark:text-amber-200">
                  You haven&apos;t listed an office address on your{" "}
                  <Link href="/profile/professional" className="underline underline-offset-2">
                    profile
                  </Link>
                  . Clients booking an in-person meeting will have to suggest a place, and
                  &quot;meet at the office&quot; won&apos;t be offered as the fallback.
                </p>
              )}

              {error && (
                <p className="mt-4 rounded-xl bg-rose-100 px-4 py-2.5 text-sm font-medium text-rose-800 dark:bg-rose-400/15 dark:text-rose-300">
                  {error}
                </p>
              )}

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || badBlock >= 0}
                  className="rounded-full bg-amber-400 px-8 py-3 text-sm font-bold text-stone-950 shadow-lg transition hover:scale-[1.02] hover:bg-amber-300 disabled:scale-100 disabled:opacity-60"
                >
                  {saving ? "Saving…" : "Save hours"}
                </button>
                {saved && (
                  <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                    Saved.
                  </span>
                )}
                <Link
                  href="/meetings"
                  className="text-sm font-bold text-stone-600 hover:underline dark:text-slate-400"
                >
                  Back to meetings
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
