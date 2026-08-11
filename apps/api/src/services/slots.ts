import {
  dhakaDateKey,
  dhakaInstant,
  dhakaWeekday,
  hhmmFromMinutes,
  minutesFromHhmm,
  type Availability,
  type MeetingSlot,
  type SlotDay,
} from "@buildora/shared";

/**
 * Turning an architect's rules into bookable slots.
 *
 * This is deliberately one pure function with no database access in it: the
 * caller loads the two inputs (the architect's rules and the meetings already
 * on the books) and passes them in. That keeps the actual scheduling logic —
 * the part that has to be right, and has to be explainable — readable end to
 * end in one place.
 *
 * Booking uses this same function to validate a requested time, rather than
 * re-checking the rules a second way. If a slot isn't in the list this function
 * produces, it cannot be booked, so the calendar the land owner sees and the
 * rule the server enforces can never drift apart.
 */

/** Do two time ranges overlap at all? Touching end-to-start does not count. */
function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/** The Dhaka date key `days` days after `dateKey`. */
function addDays(dateKey: string, days: number): string {
  const noon = dhakaInstant(dateKey, "12:00");
  return dhakaDateKey(new Date(noon.getTime() + days * 24 * 60 * 60_000));
}

/** A time range that makes a slot unavailable. */
export interface Busy {
  start: Date;
  end: Date;
}

export interface GenerateSlotsInput {
  availability: Availability;
  /** Meetings already holding time on this architect's calendar. */
  booked: Busy[];
  /** Injected so the behaviour is testable and the maths is obvious. */
  now: Date;
}

/**
 * Every free slot from now until the end of the booking window, grouped by
 * Dhaka calendar day. Days with nothing free are left out entirely.
 */
export function generateSlotDays({ availability, booked, now }: GenerateSlotsInput): SlotDay[] {
  const { slotMinutes, rules, blackoutDates, minNoticeHours, maxAdvanceDays } = availability;
  if (rules.length === 0) return [];

  // Nothing may be booked sooner than the architect's notice period.
  const earliest = new Date(now.getTime() + minNoticeHours * 60 * 60_000);
  const blackout = new Set(blackoutDates);

  const days: SlotDay[] = [];
  const firstDay = dhakaDateKey(now);

  for (let offset = 0; offset <= maxAdvanceDays; offset += 1) {
    const dateKey = addDays(firstDay, offset);
    if (blackout.has(dateKey)) continue;

    const weekday = dhakaWeekday(dhakaInstant(dateKey, "12:00"));
    const todaysRules = rules.filter((r) => r.weekday === weekday);
    if (todaysRules.length === 0) continue;

    // Keyed by start instant so two overlapping rules can't produce the same
    // slot twice (e.g. 10:00–13:00 and 12:00–15:00 both yielding 12:00).
    const found = new Map<number, MeetingSlot>();

    for (const rule of todaysRules) {
      const openMin = minutesFromHhmm(rule.start);
      const closeMin = minutesFromHhmm(rule.end);
      if (Number.isNaN(openMin) || Number.isNaN(closeMin)) continue;

      // Walk the window in slot-sized steps, stopping before any slot that
      // would run past closing time.
      for (let at = openMin; at + slotMinutes <= closeMin; at += slotMinutes) {
        const start = dhakaInstant(dateKey, hhmmFromMinutes(at));
        const end = new Date(start.getTime() + slotMinutes * 60_000);

        if (start < earliest) continue;
        if (booked.some((b) => overlaps(start, end, b.start, b.end))) continue;

        found.set(start.getTime(), { startAt: start.toISOString(), endAt: end.toISOString() });
      }
    }

    if (found.size > 0) {
      days.push({
        date: dateKey,
        slots: [...found.values()].sort((a, b) => a.startAt.localeCompare(b.startAt)),
      });
    }
  }

  return days;
}

/** Is `startAt` the exact start of a slot that's currently free? */
export function isSlotAvailable(days: SlotDay[], startAt: Date): MeetingSlot | null {
  const iso = startAt.toISOString();
  for (const day of days) {
    const match = day.slots.find((s) => s.startAt === iso);
    if (match) return match;
  }
  return null;
}
