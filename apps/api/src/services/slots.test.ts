import { describe, expect, it } from "vitest";
import { dhakaInstant, type Availability } from "@buildora/shared";
import { generateSlotDays, isSlotAvailable, type Busy } from "./slots";

/**
 * Scheduling is where off-by-one errors hide best: everything looks like a
 * plausible list of times, and the only way to notice a wrong one is for a
 * client to turn up when the architect isn't there.
 *
 * `generateSlotDays` takes `now` as an argument precisely so this can be
 * pinned down, so every test below fixes a date rather than depending on when
 * the suite happens to run.
 */

/** Sunday 2026-03-01, 09:00 Dhaka — the reference "now" for these tests. */
const SUNDAY = "2026-03-01";
const NOW = dhakaInstant(SUNDAY, "09:00");

function availability(over: Partial<Availability> = {}): Availability {
  return {
    slotMinutes: 60,
    // Sunday only, 10:00–13:00 — three clean one-hour slots.
    rules: [{ weekday: 0, start: "10:00", end: "13:00" }],
    blackoutDates: [],
    minNoticeHours: 0,
    maxAdvanceDays: 0,
    published: true,
    ...over,
  };
}

/** The Dhaka wall-clock start times produced for the first day. */
function startTimes(days: ReturnType<typeof generateSlotDays>): string[] {
  return (days[0]?.slots ?? []).map((s) =>
    new Date(s.startAt).toLocaleTimeString("en-GB", {
      timeZone: "Asia/Dhaka",
      hour: "2-digit",
      minute: "2-digit",
    })
  );
}

function busy(date: string, start: string, end: string): Busy {
  return { start: dhakaInstant(date, start), end: dhakaInstant(date, end) };
}

describe("generateSlotDays — walking the window", () => {
  it("fills a window with whole slots and stops before closing time", () => {
    const days = generateSlotDays({ availability: availability(), booked: [], now: NOW });
    expect(startTimes(days)).toEqual(["10:00", "11:00", "12:00"]);
  });

  it("never produces a slot that would run past closing time", () => {
    // 10:00–13:00 in 90-minute slots fits 10:00 and 11:30; a third would end
    // at 14:00, half an hour after the architect has gone.
    const days = generateSlotDays({
      availability: availability({ slotMinutes: 90 }),
      booked: [],
      now: NOW,
    });
    expect(startTimes(days)).toEqual(["10:00", "11:30"]);
  });

  it("does not emit the same slot twice when two rules overlap", () => {
    const days = generateSlotDays({
      availability: availability({
        rules: [
          { weekday: 0, start: "10:00", end: "13:00" },
          { weekday: 0, start: "12:00", end: "14:00" },
        ],
      }),
      booked: [],
      now: NOW,
    });
    // 12:00 is inside both rules and must still appear once.
    expect(startTimes(days)).toEqual(["10:00", "11:00", "12:00", "13:00"]);
  });

  it("returns nothing at all when the architect has set no rules", () => {
    expect(
      generateSlotDays({ availability: availability({ rules: [] }), booked: [], now: NOW })
    ).toEqual([]);
  });

  it("leaves out a day with nothing free rather than listing it empty", () => {
    // The only rule is for Sunday; a Monday "now" with maxAdvanceDays 0 has
    // no matching rule, so there is no day to show.
    const monday = dhakaInstant("2026-03-02", "09:00");
    expect(generateSlotDays({ availability: availability(), booked: [], now: monday })).toEqual([]);
  });
});

describe("generateSlotDays — the rules that protect the architect", () => {
  it("hides slots inside the notice period", () => {
    // 09:00 now, 3 hours' notice — 10:00 and 11:00 are too soon, 12:00 is fine.
    const days = generateSlotDays({
      availability: availability({ minNoticeHours: 3 }),
      booked: [],
      now: NOW,
    });
    expect(startTimes(days)).toEqual(["12:00"]);
  });

  it("skips a blackout date entirely", () => {
    const days = generateSlotDays({
      availability: availability({ blackoutDates: [SUNDAY] }),
      booked: [],
      now: NOW,
    });
    expect(days).toEqual([]);
  });

  it("opens exactly maxAdvanceDays into the future, and no further", () => {
    // Sunday + 7 days is the next Sunday, so a 7-day window has two days and
    // an 6-day one has only today.
    const week = generateSlotDays({
      availability: availability({ maxAdvanceDays: 7 }),
      booked: [],
      now: NOW,
    });
    expect(week.map((d) => d.date)).toEqual([SUNDAY, "2026-03-08"]);

    const shorter = generateSlotDays({
      availability: availability({ maxAdvanceDays: 6 }),
      booked: [],
      now: NOW,
    });
    expect(shorter.map((d) => d.date)).toEqual([SUNDAY]);
  });
});

describe("generateSlotDays — meetings already on the books", () => {
  it("removes a slot an existing meeting sits on", () => {
    const days = generateSlotDays({
      availability: availability(),
      booked: [busy(SUNDAY, "11:00", "12:00")],
      now: NOW,
    });
    expect(startTimes(days)).toEqual(["10:00", "12:00"]);
  });

  it("removes every slot a long meeting touches", () => {
    const days = generateSlotDays({
      availability: availability(),
      booked: [busy(SUNDAY, "10:30", "12:30")],
      now: NOW,
    });
    // Overlapping by half an hour is still overlapping.
    expect(startTimes(days)).toEqual([]);
  });

  it("keeps a slot that only touches a meeting end-to-start", () => {
    // A meeting ending at 11:00 does not block the 11:00 slot — back-to-back
    // is the normal case, not a clash.
    const days = generateSlotDays({
      availability: availability(),
      booked: [busy(SUNDAY, "10:00", "11:00")],
      now: NOW,
    });
    expect(startTimes(days)).toEqual(["11:00", "12:00"]);
  });
});

describe("isSlotAvailable", () => {
  it("accepts the exact start of a free slot", () => {
    const days = generateSlotDays({ availability: availability(), booked: [], now: NOW });
    expect(isSlotAvailable(days, dhakaInstant(SUNDAY, "11:00"))).not.toBeNull();
  });

  it("rejects a time inside a slot but not its start", () => {
    // Booking is validated through the same list the calendar was drawn from,
    // so a hand-crafted 11:30 request cannot slip past the rules.
    const days = generateSlotDays({ availability: availability(), booked: [], now: NOW });
    expect(isSlotAvailable(days, dhakaInstant(SUNDAY, "11:30"))).toBeNull();
  });

  it("rejects a slot that has since been taken", () => {
    const days = generateSlotDays({
      availability: availability(),
      booked: [busy(SUNDAY, "11:00", "12:00")],
      now: NOW,
    });
    expect(isSlotAvailable(days, dhakaInstant(SUNDAY, "11:00"))).toBeNull();
  });
});
