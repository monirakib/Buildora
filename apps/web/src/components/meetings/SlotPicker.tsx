"use client";

import { useEffect, useState } from "react";
import { dhakaDateLabel, dhakaTimeLabel, type SlotDay } from "@buildora/shared";

/**
 * Pick a day, then a time on that day.
 *
 * Shared by the booking form on an architect's profile and the reschedule
 * dialog on the meetings page — both are the same question ("which of these
 * openings do you want?"), so they're the same component.
 *
 * Every time shown here is Bangladesh Standard Time. The slots arrive from the
 * API as UTC instants and the labels come from the shared Dhaka helpers, so a
 * user whose laptop clock is set to another country still reads the same time
 * the architect published.
 */
export function SlotPicker({
  days,
  value,
  onChange,
}: {
  days: SlotDay[];
  /** ISO instant of the selected slot, or null. */
  value: string | null;
  onChange: (startAt: string) => void;
}) {
  const [activeDate, setActiveDate] = useState<string | null>(days[0]?.date ?? null);

  // When the day list changes (a reload, a different architect), fall back to
  // the first day that still exists rather than a date that's no longer there.
  useEffect(() => {
    setActiveDate((current) =>
      current && days.some((d) => d.date === current) ? current : (days[0]?.date ?? null)
    );
  }, [days]);

  if (days.length === 0) {
    return (
      <p className="rounded-xl bg-stone-100 px-4 py-3 text-sm text-stone-600 dark:bg-white/5 dark:text-slate-400">
        No open times in the next few weeks. Try again later, or send them a message.
      </p>
    );
  }

  const active = days.find((d) => d.date === activeDate) ?? days[0]!;

  return (
    <div>
      {/* Day strip — scrolls sideways on a phone rather than wrapping into a wall of buttons. */}
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
        {days.map((day) => {
          const selected = day.date === active.date;
          return (
            <button
              key={day.date}
              type="button"
              onClick={() => setActiveDate(day.date)}
              className={`shrink-0 rounded-xl border px-3.5 py-2 text-left transition ${
                selected
                  ? "border-amber-500 bg-amber-400/20"
                  : "border-stone-300/80 hover:border-amber-400/60 dark:border-white/15"
              }`}
            >
              <span className="block text-xs font-bold whitespace-nowrap">
                {dhakaDateLabel(day.slots[0]!.startAt)}
              </span>
              <span className="mt-0.5 block text-[11px] font-medium text-stone-500 dark:text-slate-400">
                {day.slots.length} {day.slots.length === 1 ? "opening" : "openings"}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {active.slots.map((slot) => {
          const selected = slot.startAt === value;
          return (
            <button
              key={slot.startAt}
              type="button"
              onClick={() => onChange(slot.startAt)}
              className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
                selected
                  ? "border-amber-500 bg-amber-400 text-stone-950"
                  : "border-stone-300/80 hover:border-amber-400/60 dark:border-white/15"
              }`}
            >
              {dhakaTimeLabel(slot.startAt)}
            </button>
          );
        })}
      </div>

      <p className="mt-3 text-xs font-medium text-stone-500 dark:text-slate-400">
        All times are Bangladesh Standard Time (GMT+6).
      </p>
    </div>
  );
}
