"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CallMedia,
  MeetingMode,
  MeetingStatus,
  UserRole,
  dhakaDateLabel,
  dhakaTimeLabel,
  type CallPeer,
  type Meeting,
  type MeetingParty,
} from "@buildora/shared";
import {
  acceptVenue,
  cancelMeeting,
  chooseOfficeVenue,
  getArchitectSlots,
  listMyMeetings,
  proposeVenue,
  rescheduleMeeting,
} from "@/lib/apiMeetings";
import { downloadIcs, googleCalendarUrl, meetingEventFields } from "@/lib/calendarLinks";
import { useCall } from "@/store/useCall";
import { useSession } from "@/store/useSession";
import { Navbar } from "@/components/landing/Navbar";
import { SlotPicker } from "@/components/meetings/SlotPicker";
import { surfaceBodyClass, surfaceClass, surfaceHeaderClass } from "@/components/ui/surface";

const inputClass =
  "block w-full rounded-xl border border-stone-300/80 bg-white/70 px-4 py-2.5 text-sm text-stone-900 placeholder-stone-400 backdrop-blur transition outline-none focus:border-amber-500 focus:bg-white/90 focus:ring-2 focus:ring-amber-400/30 dark:border-white/15 dark:bg-white/5 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:bg-white/10";

const smallButtonClass =
  "rounded-full border border-stone-300/80 px-4 py-1.5 text-xs font-bold transition hover:border-amber-400/60 disabled:opacity-60 dark:border-white/15";

const primaryButtonClass =
  "rounded-full bg-amber-400 px-4 py-1.5 text-xs font-bold text-stone-950 transition hover:bg-amber-300 disabled:opacity-60";

const statusStyles: Record<MeetingStatus, string> = {
  [MeetingStatus.CONFIRMED]: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  [MeetingStatus.PENDING_VENUE]: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  [MeetingStatus.CANCELLED]: "bg-stone-500/15 text-stone-600 dark:text-slate-400",
};

const statusLabels: Record<MeetingStatus, string> = {
  [MeetingStatus.CONFIRMED]: "Confirmed",
  [MeetingStatus.PENDING_VENUE]: "Place not settled",
  [MeetingStatus.CANCELLED]: "Cancelled",
};

export default function MeetingsPage() {
  const router = useRouter();
  const user = useSession((s) => s.user);
  const token = useSession((s) => s.token);
  const startCall = useCall((s) => s.start);

  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const reload = useCallback(async () => {
    if (!token) return;
    setMeetings(await listMyMeetings(token));
  }, [token]);

  useEffect(() => {
    if (!mounted) return;
    if (!user || !token) {
      router.replace("/auth");
      return;
    }
    reload()
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load your meetings"))
      .finally(() => setLoading(false));
  }, [mounted, user, token, router, reload]);

  const isArchitect = user?.role === UserRole.ARCHITECT;
  const now = Date.now();
  const upcoming = meetings.filter(
    (m) => new Date(m.endAt).getTime() >= now && m.status !== MeetingStatus.CANCELLED
  );
  // Everything else: finished, or called off. Most recent first.
  const past = meetings
    .filter((m) => new Date(m.endAt).getTime() < now || m.status === MeetingStatus.CANCELLED)
    .reverse();

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="flex-1 px-5 pt-28 pb-16 sm:px-8">
        <div className="mx-auto w-full max-w-3xl">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm font-bold tracking-[0.2em] text-amber-600 uppercase dark:text-amber-400">
                Meetings
              </p>
              <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">
                {isArchitect ? "Your client meetings" : "Meetings with architects"}
              </h1>
            </div>
            {isArchitect && (
              <Link
                href="/meetings/availability"
                className="rounded-full bg-amber-400 px-5 py-2.5 text-sm font-bold text-stone-950 shadow-lg transition hover:bg-amber-300"
              >
                Set your hours
              </Link>
            )}
          </div>

          {loading ? (
            <p className="mt-8 text-sm text-stone-500 dark:text-slate-500">Loading…</p>
          ) : error ? (
            <p className="mt-8 rounded-xl bg-rose-100 px-4 py-2.5 text-sm font-medium text-rose-800 dark:bg-rose-400/15 dark:text-rose-300">
              {error}
            </p>
          ) : meetings.length === 0 ? (
            <div className={`mt-8 ${surfaceClass}`}>
              <div className="p-8 text-center">
                <p className="text-stone-600 dark:text-slate-400">
                  {isArchitect
                    ? "No meetings booked yet. Publish your hours and land owners can book you."
                    : "You haven't booked any meetings yet."}
                </p>
                {!isArchitect && (
                  <Link
                    href="/architects"
                    className="mt-4 inline-block rounded-full bg-amber-400 px-6 py-2.5 text-sm font-bold text-stone-950 transition hover:bg-amber-300"
                  >
                    Find an architect
                  </Link>
                )}
              </div>
            </div>
          ) : (
            <>
              <Section title="Upcoming" empty="Nothing coming up.">
                {upcoming.map((m) => (
                  <MeetingCard
                    key={m.id}
                    meeting={m}
                    userId={user!.id}
                    userEmail={user!.email}
                    token={token!}
                    onChanged={reload}
                    onCall={startCall}
                  />
                ))}
              </Section>

              {past.length > 0 && (
                <Section title="Past and cancelled">
                  {past.map((m) => (
                    <MeetingCard
                      key={m.id}
                      meeting={m}
                      userId={user!.id}
                      userEmail={user!.email}
                      token={token!}
                      onChanged={reload}
                      onCall={startCall}
                    />
                  ))}
                </Section>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function Section({
  title,
  empty,
  children,
}: {
  title: string;
  empty?: string;
  children: React.ReactNode[];
}) {
  return (
    <section className="mt-8">
      <h2 className="text-xs font-bold tracking-widest text-stone-500 uppercase dark:text-slate-400">
        {title}
      </h2>
      {children.length === 0 ? (
        <p className="mt-3 text-sm text-stone-500 dark:text-slate-500">{empty}</p>
      ) : (
        <div className="mt-3 flex flex-col gap-4">{children}</div>
      )}
    </section>
  );
}

/** One meeting, with whatever actions are open to this user right now. */
function MeetingCard({
  meeting,
  userId,
  userEmail,
  token,
  onChanged,
  onCall,
}: {
  meeting: Meeting;
  userId: string;
  /** Hints Google which of several signed-in accounts to open the link with. */
  userEmail: string;
  token: string;
  onChanged: () => Promise<void>;
  onCall: (peer: CallPeer, media?: CallMedia) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<"none" | "propose" | "cancel" | "reschedule">("none");
  const [place, setPlace] = useState("");
  const [reason, setReason] = useState("");

  const party: MeetingParty = meeting.landOwner.id === userId ? "LAND_OWNER" : "ARCHITECT";
  const other = party === "LAND_OWNER" ? meeting.architect : meeting.landOwner;
  const isUpcoming = new Date(meeting.endAt).getTime() >= Date.now();
  const canAct = isUpcoming && meeting.status !== MeetingStatus.CANCELLED;
  const myTurn = meeting.venue?.awaitingFrom === party;

  /** Runs an action, surfaces its error, and refreshes the list on success. */
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      setPanel("none");
      setPlace("");
      setReason("");
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work");
    } finally {
      setBusy(false);
    }
  }

  const location =
    meeting.mode === MeetingMode.IN_PERSON
      ? meeting.venue?.isOffice
        ? meeting.officeAddress
        : meeting.venue?.place
      : undefined;

  return (
    <article className={surfaceClass}>
      <div className={surfaceHeaderClass}>
        <div>
          <p className="text-sm font-extrabold">
            {dhakaDateLabel(meeting.startAt)} · {dhakaTimeLabel(meeting.startAt)}–
            {dhakaTimeLabel(meeting.endAt)}
          </p>
          <p className="mt-1 text-xs font-medium text-stone-600 dark:text-slate-400">
            with{" "}
            {other.role === UserRole.ARCHITECT ? (
              <Link href={`/architects/${other.id}`} className="underline underline-offset-2">
                {other.name}
              </Link>
            ) : (
              other.name
            )}
            {other.company ? ` · ${other.company}` : ""}
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-bold ${statusStyles[meeting.status]}`}
        >
          {statusLabels[meeting.status]}
        </span>
      </div>

      <div className={surfaceBodyClass}>
        <p className="text-sm">
          <span className="font-semibold">
            {meeting.mode === MeetingMode.ONLINE ? "Online" : "In person"}
          </span>
          {location ? ` · ${location}` : ""}
          {meeting.mode === MeetingMode.ONLINE ? " · Buildora video call" : ""}
        </p>

        {meeting.agenda && (
          <p className="mt-2 text-sm text-stone-600 dark:text-slate-400">{meeting.agenda}</p>
        )}

        {meeting.status === MeetingStatus.CANCELLED && (
          <p className="mt-2 text-sm text-stone-600 dark:text-slate-400">
            Cancelled by {meeting.cancelledBy === party ? "you" : other.name}
            {meeting.cancelReason ? ` — ${meeting.cancelReason}` : ""}.
          </p>
        )}

        {/* Put it on a real calendar. These need no Google account, no
            permission and no keys — they work for anyone. */}
        {meeting.status === MeetingStatus.CONFIRMED && isUpcoming && (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            <a
              href={googleCalendarUrl(meetingEventFields(meeting, party), userEmail)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-bold text-amber-700 hover:underline dark:text-amber-400"
            >
              Add to Google Calendar
            </a>
            <button
              type="button"
              onClick={() => downloadIcs(meetingEventFields(meeting, party), meeting.id)}
              className="text-xs font-bold text-stone-600 hover:underline dark:text-slate-400"
            >
              Download .ics
            </button>
            <span className="text-xs text-stone-500 dark:text-slate-500">
              One-off copy — it won&apos;t follow changes.
            </span>
          </div>
        )}

        {/* ---- Venue negotiation ---- */}
        {meeting.status === MeetingStatus.PENDING_VENUE && canAct && (
          <div className="mt-4 rounded-xl bg-amber-500/10 p-4">
            <p className="text-sm font-bold">
              {myTurn
                ? `${other.name} suggested meeting at ${meeting.venue?.place}`
                : `Waiting for ${other.name} to answer`}
            </p>
            <p className="mt-1 text-xs text-stone-600 dark:text-slate-400">
              The time is held either way.{" "}
              {myTurn
                ? "Accept it, suggest somewhere else, or move it to the office."
                : `You suggested ${meeting.venue?.place}.`}
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              {myTurn && (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => run(() => acceptVenue(token, meeting.id))}
                    className={primaryButtonClass}
                  >
                    Accept this place
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setPanel(panel === "propose" ? "none" : "propose")}
                    className={smallButtonClass}
                  >
                    Suggest another
                  </button>
                </>
              )}
              {meeting.officeAddress && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run(() => chooseOfficeVenue(token, meeting.id))}
                  className={smallButtonClass}
                >
                  Meet at the office
                </button>
              )}
            </div>

            {panel === "propose" && (
              <div className="mt-3">
                <input
                  value={place}
                  onChange={(e) => setPlace(e.target.value)}
                  maxLength={300}
                  placeholder="Where would you rather meet?"
                  className={inputClass}
                />
                <button
                  type="button"
                  disabled={busy || place.trim().length < 3}
                  onClick={() => run(() => proposeVenue(token, meeting.id, place.trim()))}
                  className={`mt-2 ${primaryButtonClass}`}
                >
                  Send suggestion
                </button>
              </div>
            )}

            {meeting.venue && meeting.venue.history.length > 1 && (
              <ol className="mt-3 border-t border-black/5 pt-3 text-xs text-stone-600 dark:border-white/10 dark:text-slate-400">
                {meeting.venue.history.map((h, i) => (
                  <li key={i}>
                    {h.by === party ? "You" : other.name} suggested {h.place}
                    {h.outcome === "REJECTED" ? " — passed over" : ""}
                    {h.outcome === "ACCEPTED" ? " — agreed" : ""}
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}

        {/* ---- Actions ---- */}
        {canAct && (
          <div className="mt-4 flex flex-wrap gap-2">
            {meeting.mode === MeetingMode.ONLINE && meeting.status === MeetingStatus.CONFIRMED && (
              <button
                type="button"
                onClick={() => onCall(other, CallMedia.VIDEO)}
                className={primaryButtonClass}
              >
                Start video call
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => setPanel(panel === "reschedule" ? "none" : "reschedule")}
              className={smallButtonClass}
            >
              Reschedule
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setPanel(panel === "cancel" ? "none" : "cancel")}
              className={smallButtonClass}
            >
              Cancel
            </button>
          </div>
        )}

        {panel === "cancel" && (
          <div className="mt-3">
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              placeholder="Reason (optional) — they'll see this"
              className={inputClass}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                run(() => cancelMeeting(token, meeting.id, reason.trim() || undefined))
              }
              className="mt-2 rounded-full bg-rose-500 px-4 py-1.5 text-xs font-bold text-white transition hover:bg-rose-400 disabled:opacity-60"
            >
              {busy ? "Cancelling…" : "Cancel this meeting"}
            </button>
          </div>
        )}

        {panel === "reschedule" && (
          <ReschedulePanel
            meeting={meeting}
            token={token}
            busy={busy}
            onSubmit={(startAt) => run(() => rescheduleMeeting(token, meeting.id, startAt))}
          />
        )}

        {error && (
          <p className="mt-3 rounded-xl bg-rose-100 px-4 py-2.5 text-sm font-medium text-rose-800 dark:bg-rose-400/15 dark:text-rose-300">
            {error}
          </p>
        )}
      </div>
    </article>
  );
}

/** Loads the architect's current openings and lets either side pick a new one. */
function ReschedulePanel({
  meeting,
  token,
  busy,
  onSubmit,
}: {
  meeting: Meeting;
  token: string;
  busy: boolean;
  onSubmit: (startAt: string) => void;
}) {
  const [days, setDays] = useState<Awaited<ReturnType<typeof getArchitectSlots>> | null>(null);
  const [choice, setChoice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getArchitectSlots(token, meeting.architect.id)
      .then((res) => active && setDays(res))
      .catch(() => active && setDays(null));
    return () => {
      active = false;
    };
  }, [token, meeting.architect.id]);

  if (!days) {
    return <p className="mt-3 text-sm text-stone-500 dark:text-slate-500">Loading open times…</p>;
  }
  if (!days.bookable) {
    return (
      <p className="mt-3 text-sm text-stone-600 dark:text-slate-400">
        {days.reason ?? "This calendar is closed right now."}
      </p>
    );
  }

  return (
    <div className="mt-3">
      <SlotPicker days={days.days} value={choice} onChange={setChoice} />
      <button
        type="button"
        disabled={busy || !choice}
        onClick={() => choice && onSubmit(choice)}
        className={`mt-3 ${primaryButtonClass}`}
      >
        {busy ? "Moving…" : "Move the meeting here"}
      </button>
    </div>
  );
}
