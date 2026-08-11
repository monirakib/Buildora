import type { MeetingMode, MeetingStatus, UserRole } from "./enums";
import type { UserRef } from "./types";

/**
 * Meeting scheduling — shared shapes and the Dhaka clock helpers.
 *
 * Everything on Buildora runs on Bangladesh Standard Time. BST is UTC+6 and has
 * never observed daylight saving (the 2009 experiment was abandoned within
 * months), so the offset is a constant rather than something that needs a
 * timezone database. That single fact is what lets the slot maths below be
 * plain arithmetic: shift by six hours, read the UTC parts, and you are looking
 * at a Dhaka wall clock.
 *
 * Instants themselves are always stored and sent as UTC ISO strings. Only the
 * *display* and the *slot boundaries* are Dhaka-local.
 */

/** Bangladesh Standard Time: UTC+6, no daylight saving, ever. */
export const DHAKA_OFFSET_MINUTES = 360;

/** IANA name, sent with calendar exports so the event labels correctly. */
export const DHAKA_TIME_ZONE = "Asia/Dhaka";

/** Weekday names, Sunday-first — the Bangladeshi working week is Sun–Thu. */
export const WEEKDAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/** Meeting lengths an architect can choose between. */
export const SLOT_MINUTE_OPTIONS = [30, 45, 60, 90] as const;

/** Which side of a meeting a person is on. */
export type MeetingParty = "LAND_OWNER" | "ARCHITECT";

/** One stretch of a weekday the architect is open for meetings. */
export interface AvailabilityRule {
  /** 0 = Sunday … 6 = Saturday, matching WEEKDAY_LABELS. */
  weekday: number;
  /** Dhaka wall-clock "HH:MM", 24-hour. */
  start: string;
  end: string;
}

/** An architect's bookable hours. One document per architect. */
export interface Availability {
  /** Length of a single meeting, in minutes. */
  slotMinutes: number;
  rules: AvailabilityRule[];
  /** "YYYY-MM-DD" days off — holidays, leave, anything one-off. */
  blackoutDates: string[];
  /** How far ahead a booking must be made (stops same-minute bookings). */
  minNoticeHours: number;
  /** How far into the future the calendar opens. */
  maxAdvanceDays: number;
  /** False while the architect is still setting it up — hides the booker. */
  published: boolean;
  updatedAt?: string;
}

/** Sensible starting point for an architect who has never opened the editor. */
export const DEFAULT_AVAILABILITY: Availability = {
  slotMinutes: 60,
  // Sunday–Thursday, 10:00–17:00 with a 13:00–14:00 lunch break left out.
  rules: [0, 1, 2, 3, 4].flatMap((weekday) => [
    { weekday, start: "10:00", end: "13:00" },
    { weekday, start: "14:00", end: "17:00" },
  ]),
  blackoutDates: [],
  minNoticeHours: 12,
  maxAdvanceDays: 30,
  published: false,
};

/** One bookable opening on the architect's calendar. */
export interface MeetingSlot {
  /** UTC ISO instant the slot starts. */
  startAt: string;
  endAt: string;
}

/** A day of slots, as the booking UI wants them. */
export interface SlotDay {
  /** "YYYY-MM-DD" in Dhaka time. */
  date: string;
  slots: MeetingSlot[];
}

/** One round of the in-person venue negotiation. */
export interface VenueProposal {
  place: string;
  by: MeetingParty;
  at: string;
  outcome: "PENDING" | "ACCEPTED" | "REJECTED";
}

/**
 * Where an in-person meeting happens. `isOffice` is the settled fallback —
 * either side can always end the negotiation by accepting the office.
 */
export interface MeetingVenue {
  isOffice: boolean;
  /** The agreed (or currently proposed) address. Absent when it's the office. */
  place?: string;
  /** Who the ball is with while status is PENDING_VENUE. */
  awaitingFrom?: MeetingParty;
  history: VenueProposal[];
}

/**
 * A meeting's participant. Carries a little more than the plain `UserRef`
 * because the meetings page can start the built-in video call straight from a
 * meeting card, and the call UI wants a role and an avatar.
 */
export interface MeetingParticipant extends UserRef {
  role: UserRole;
  avatarUrl?: string;
}

/** A booked meeting between a land owner and an architect. */
export interface Meeting {
  id: string;
  landOwner: MeetingParticipant;
  architect: MeetingParticipant;
  startAt: string;
  endAt: string;
  mode: MeetingMode;
  status: MeetingStatus;
  /** What the land owner wants to talk about. */
  agenda?: string;
  /** Only for IN_PERSON meetings. */
  venue?: MeetingVenue;
  /** The architect's office address, copied in at booking time. */
  officeAddress?: string;
  cancelledBy?: MeetingParty;
  cancelReason?: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Dhaka clock helpers
// ---------------------------------------------------------------------------

/** Shifts an instant into Dhaka's frame so UTC getters read as local time. */
function shifted(at: Date | string): Date {
  const d = typeof at === "string" ? new Date(at) : at;
  return new Date(d.getTime() + DHAKA_OFFSET_MINUTES * 60_000);
}

/** The Dhaka calendar day an instant falls on, as "YYYY-MM-DD". */
export function dhakaDateKey(at: Date | string): string {
  return shifted(at).toISOString().slice(0, 10);
}

/** The Dhaka weekday an instant falls on (0 = Sunday). */
export function dhakaWeekday(at: Date | string): number {
  return shifted(at).getUTCDay();
}

/** Minutes past Dhaka midnight for an instant. */
export function dhakaMinutes(at: Date | string): number {
  const d = shifted(at);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/**
 * Builds the instant for a Dhaka wall-clock date and time. Written as an
 * explicit offset in the string rather than `new Date(y, m, d)` because the
 * latter would use whatever timezone the *server* happens to run in.
 */
export function dhakaInstant(dateKey: string, hhmm: string): Date {
  return new Date(`${dateKey}T${hhmm}:00+06:00`);
}

/** "HH:MM" → minutes past midnight. Returns NaN on anything malformed. */
export function minutesFromHhmm(hhmm: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!match) return NaN;
  const hours = Number(match[1]);
  const mins = Number(match[2]);
  if (hours > 23 || mins > 59) return NaN;
  return hours * 60 + mins;
}

/** Minutes past midnight → "HH:MM". */
export function hhmmFromMinutes(total: number): string {
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

/** "14:30" → "2:30 pm", for anything a user reads. */
export function timeLabel(hhmm: string): string {
  const total = minutesFromHhmm(hhmm);
  if (Number.isNaN(total)) return hhmm;
  const hours24 = Math.floor(total / 60);
  const mins = total % 60;
  const suffix = hours24 < 12 ? "am" : "pm";
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${String(mins).padStart(2, "0")} ${suffix}`;
}

/** An instant as a Dhaka clock time, e.g. "2:30 pm". */
export function dhakaTimeLabel(at: Date | string): string {
  return timeLabel(hhmmFromMinutes(dhakaMinutes(at)));
}

/** An instant as a Dhaka date, e.g. "Sun, 16 Aug 2026". */
export function dhakaDateLabel(at: Date | string): string {
  const d = shifted(at);
  const weekday = (WEEKDAY_LABELS[d.getUTCDay()] ?? "").slice(0, 3);
  const month = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ][d.getUTCMonth()];
  return `${weekday}, ${d.getUTCDate()} ${month} ${d.getUTCFullYear()}`;
}
