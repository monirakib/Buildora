import {
  DHAKA_TIME_ZONE,
  MeetingMode,
  dhakaDateLabel,
  dhakaTimeLabel,
  type Meeting,
  type MeetingParty,
} from "@buildora/shared";

/**
 * Getting a meeting onto someone's calendar without asking Google for anything.
 *
 * There are two ways to put an event on a user's Google Calendar. The
 * heavyweight one is OAuth: the user grants the app permission and the server
 * writes to their calendar through the Calendar API. It syncs beautifully, but
 * Google gates it — an app requesting calendar scopes has to pass their
 * verification review (which needs a domain you own) before anyone outside a
 * hand-maintained allow-list can grant it. That is a poor fit for a project on
 * free hosting, so this app doesn't use it.
 *
 * This is the other way, and it has no gate on it at all: build a link, or hand
 * the browser a file. `googleCalendarUrl` produces Google's own "new event"
 * page with every field pre-filled, and `buildIcs` produces the universal
 * format every other calendar app reads. No keys, no consent screen, no
 * account, no server round trip — it works for every visitor.
 *
 * The trade-off, stated plainly in the UI too: an event added this way is a
 * *copy*. Reschedule or cancel the meeting on Buildora afterwards and the copy
 * doesn't follow. Buildora itself stays the source of truth.
 */

/** The fields any calendar needs, whichever way we hand them over. */
export interface CalendarEventFields {
  title: string;
  details: string;
  location?: string;
  startAt: string;
  endAt: string;
}

/**
 * Describes a meeting from one side's point of view — the title names the
 * *other* person, since "meeting with myself" helps nobody.
 */
export function meetingEventFields(meeting: Meeting, party: MeetingParty): CalendarEventFields {
  const other = party === "LAND_OWNER" ? meeting.architect : meeting.landOwner;
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  const location =
    meeting.mode === MeetingMode.IN_PERSON
      ? meeting.venue?.isOffice
        ? meeting.officeAddress
        : meeting.venue?.place
      : undefined;

  const lines = [
    meeting.mode === MeetingMode.ONLINE
      ? `Online meeting, start the video call from Buildora: ${origin}/meetings`
      : `In-person meeting${location ? ` at ${location}` : ""}`,
  ];
  if (meeting.agenda) lines.push("", `What it's about: ${meeting.agenda}`);
  lines.push("", `Manage this meeting: ${origin}/meetings`);

  return {
    title: `Buildora, meeting with ${other.name}`,
    details: lines.join("\n"),
    location,
    startAt: meeting.startAt,
    endAt: meeting.endAt,
  };
}

/** "2026-08-16T09:00:00.000Z" → "20260816T090000Z", the format both formats want. */
function toCalendarStamp(iso: string): string {
  return new Date(iso)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

/**
 * A pre-filled Google Calendar "new event" page.
 *
 * This is just Google's own compose URL with the fields in the query string —
 * no API, no key, no consent. The user lands on their calendar with everything
 * filled in and presses Save. If they aren't signed in, Google asks them to,
 * and it still works.
 *
 * `accountHint` solves the multi-account problem. Somebody signed into two or
 * three Google accounts in one browser has a *default* one, and without a hint
 * Google hands the link to that default — which is very often not the account
 * they use for Buildora, so the event lands on the wrong calendar. Passing
 * their Buildora email as `authuser` tells Google which signed-in session to
 * use.
 *
 * What happens when that account isn't signed in on the machine is Google's
 * call, not ours: it shows the account chooser, or falls back to the default.
 * Either is fine — both end with the user on a calendar they can save to. The
 * hint can only improve the guess, never break the link.
 */
export function googleCalendarUrl(event: CalendarEventFields, accountHint?: string): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${toCalendarStamp(event.startAt)}/${toCalendarStamp(event.endAt)}`,
    details: event.details,
    // Google reads the times as UTC because of the trailing Z, but naming the
    // zone makes the event display as Dhaka time for someone travelling.
    ctz: DHAKA_TIME_ZONE,
  });
  if (event.location) params.set("location", event.location);
  // Only send a hint that could plausibly match a Google session.
  if (accountHint && accountHint.includes("@")) params.set("authuser", accountHint);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Escapes a value for an iCalendar property. RFC 5545 §3.3.11: backslashes,
 * semicolons and commas are special, and real line breaks have to become "\n".
 */
function escapeIcs(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Folds a long line to 75 octets, as the spec requires — a continuation line
 * starts with a single space. Calendar apps are mostly forgiving about this,
 * but Outlook is not, and a truncated description is a confusing bug to chase.
 */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const chunks: string[] = [line.slice(0, 75)];
  for (let at = 75; at < line.length; at += 74) {
    chunks.push(` ${line.slice(at, at + 74)}`);
  }
  return chunks.join("\r\n");
}

/**
 * An .ics file for the meeting — the universal format. Apple Calendar, Outlook,
 * Thunderbird and Google all import it, which is why it's offered alongside the
 * Google-specific link.
 */
export function buildIcs(event: CalendarEventFields, uid: string): string {
  const rows = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Buildora//Meetings//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    // Stable per meeting, so a calendar that already holds this event updates
    // it rather than adding a second copy on re-import.
    `UID:${uid}@buildora`,
    `DTSTAMP:${toCalendarStamp(new Date().toISOString())}`,
    `DTSTART:${toCalendarStamp(event.startAt)}`,
    `DTEND:${toCalendarStamp(event.endAt)}`,
    `SUMMARY:${escapeIcs(event.title)}`,
    `DESCRIPTION:${escapeIcs(event.details)}`,
    ...(event.location ? [`LOCATION:${escapeIcs(event.location)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  // CRLF line endings are required by the spec, not a Windows detail.
  return rows.map(foldLine).join("\r\n");
}

/** Hands the .ics to the browser as a download. */
export function downloadIcs(event: CalendarEventFields, uid: string): void {
  const blob = new Blob([buildIcs(event, uid)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `buildora-meeting-${dhakaDateLabel(event.startAt).replace(/[ ,]+/g, "-")}-${dhakaTimeLabel(event.startAt).replace(/[ :]/g, "")}.ics`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Freed on the next tick — revoking immediately can cancel the download in
  // some browsers before it has read the blob.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
