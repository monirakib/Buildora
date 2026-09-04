"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  MeetingMode,
  MeetingStatus,
  UserRole,
  dhakaDateLabel,
  dhakaTimeLabel,
} from "@buildora/shared";
import { bookMeeting, getArchitectSlots, type ArchitectSlots } from "@/lib/apiMeetings";
import { useSession } from "@/store/useSession";
import { SlotPicker } from "./SlotPicker";

const inputClass =
  "block w-full rounded-xl border border-stone-300/80 bg-white/70 px-4 py-2.5 text-sm text-stone-900 placeholder-stone-400 backdrop-blur transition outline-none focus:border-amber-500 focus:bg-white/90 focus:ring-2 focus:ring-amber-400/30 dark:border-white/15 dark:bg-white/5 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:bg-white/10";

const labelClass = "mb-1.5 block text-sm font-semibold";

/** A radio card — the chunky, tappable kind this app uses for choices. */
function ChoiceCard({
  selected,
  onSelect,
  title,
  detail,
  disabled,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  detail: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={`flex-1 rounded-xl border px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
        selected
          ? "border-amber-500 bg-amber-400/15"
          : "border-stone-300/80 hover:border-amber-400/60 dark:border-white/15"
      }`}
    >
      <span className="block text-sm font-bold">{title}</span>
      <span className="mt-0.5 block text-xs text-stone-600 dark:text-slate-400">{detail}</span>
    </button>
  );
}

/**
 * "Book a meeting" on an architect's public profile.
 *
 * The API only offers slots that are genuinely free — the architect's published
 * hours minus everything already booked. The one case that doesn't confirm on
 * the spot is an in-person meeting somewhere other than the office: that holds
 * the time and waits for the architect to agree on a place.
 */
export function BookMeeting({
  architectId,
  architectName,
}: {
  architectId: string;
  architectName: string;
}) {
  const user = useSession((s) => s.user);
  const token = useSession((s) => s.token);

  const [data, setData] = useState<ArchitectSlots | null>(null);
  const [loading, setLoading] = useState(true);

  const [startAt, setStartAt] = useState<string | null>(null);
  const [mode, setMode] = useState<MeetingMode>(MeetingMode.ONLINE);
  const [venueChoice, setVenueChoice] = useState<"OFFICE" | "PROPOSE">("OFFICE");
  const [venuePlace, setVenuePlace] = useState("");
  const [agenda, setAgenda] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [booked, setBooked] = useState<{ when: string; pending: boolean } | null>(null);

  const isLandOwner = user?.role === UserRole.LAND_OWNER;

  useEffect(() => {
    if (!token || !isLandOwner) {
      setLoading(false);
      return;
    }
    let active = true;
    getArchitectSlots(token, architectId)
      .then((res) => {
        if (!active) return;
        setData(res);
        // Default the venue to whichever option the architect can actually
        // offer — proposing a place is the only choice without an office.
        if (!res.officeAddress) setVenueChoice("PROPOSE");
      })
      .catch(() => active && setData(null))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [token, architectId, isLandOwner]);

  async function handleBook() {
    if (!token || !startAt) return;
    setSaving(true);
    setError(null);
    try {
      const meeting = await bookMeeting(token, {
        architectId,
        startAt,
        mode,
        agenda: agenda.trim() || undefined,
        ...(mode === MeetingMode.IN_PERSON
          ? { venueChoice, venuePlace: venueChoice === "PROPOSE" ? venuePlace.trim() : undefined }
          : {}),
      });
      setBooked({
        when: `${dhakaDateLabel(meeting.startAt)} at ${dhakaTimeLabel(meeting.startAt)}`,
        pending: meeting.status === MeetingStatus.PENDING_VENUE,
      });
      // Reload so the slot just taken disappears for the next booking.
      setStartAt(null);
      setData(await getArchitectSlots(token, architectId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't book that meeting");
    } finally {
      setSaving(false);
    }
  }

  if (!token) {
    return (
      <div>
        <p className="text-sm text-stone-600 dark:text-slate-400">
          Sign in as a land owner to book a meeting with {architectName}.
        </p>
        <Link
          href="/auth"
          className="mt-4 inline-block rounded-full btn-primary px-6 py-2.5 text-sm"
        >
          Sign in to book
        </Link>
      </div>
    );
  }

  if (!isLandOwner) {
    return (
      <p className="text-sm text-stone-600 dark:text-slate-400">
        Only land owners can book meetings with an architect.
      </p>
    );
  }

  if (loading) {
    return <p className="text-sm text-stone-500 dark:text-slate-500">Loading open times…</p>;
  }

  if (!data?.bookable) {
    return (
      <p className="rounded-xl bg-stone-100 px-4 py-3 text-sm text-stone-600 dark:bg-white/5 dark:text-slate-400">
        {data?.reason ?? "This architect isn't taking meetings right now."}
      </p>
    );
  }

  return (
    <div>
      {booked && (
        <div className="mb-5 alert alert-success">
          {booked.pending ? (
            <>
              Time held for {booked.when}. {architectName} still has to agree to the place you
              suggested, you&apos;ll see their answer under{" "}
              <Link href="/meetings" className="underline underline-offset-2">
                your meetings
              </Link>
              .
            </>
          ) : (
            <>
              Booked for {booked.when}. It&apos;s on{" "}
              <Link href="/meetings" className="underline underline-offset-2">
                your meetings
              </Link>{" "}
              page.
            </>
          )}
        </div>
      )}

      <p className={labelClass}>Pick a time ({data.slotMinutes} minutes)</p>
      <SlotPicker days={data.days} value={startAt} onChange={setStartAt} />

      <div className="mt-6">
        <p className={labelClass}>How would you like to meet?</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <ChoiceCard
            selected={mode === MeetingMode.ONLINE}
            onSelect={() => setMode(MeetingMode.ONLINE)}
            title="Online"
            detail="Over Buildora's built-in video call"
          />
          <ChoiceCard
            selected={mode === MeetingMode.IN_PERSON}
            onSelect={() => setMode(MeetingMode.IN_PERSON)}
            title="In person"
            detail="At their office, or somewhere you both agree"
          />
        </div>
      </div>

      {mode === MeetingMode.IN_PERSON && (
        <div className="mt-4">
          <p className={labelClass}>Where?</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <ChoiceCard
              selected={venueChoice === "OFFICE"}
              onSelect={() => setVenueChoice("OFFICE")}
              title="Their office"
              detail={data.officeAddress ?? "No office address on file"}
              disabled={!data.officeAddress}
            />
            <ChoiceCard
              selected={venueChoice === "PROPOSE"}
              onSelect={() => setVenueChoice("PROPOSE")}
              title="Somewhere else"
              detail="Suggest a place, they can accept or counter"
            />
          </div>

          {venueChoice === "PROPOSE" && (
            <div className="mt-3">
              <input
                value={venuePlace}
                onChange={(e) => setVenuePlace(e.target.value)}
                maxLength={300}
                placeholder="e.g. the plot in Bashundhara R/A, Block C"
                className={inputClass}
              />
              <p className="mt-1.5 text-xs font-medium text-stone-600 dark:text-slate-400">
                The time is held straight away. The meeting is confirmed once{" "}
                {architectName.split(" ")[0]} accepts the place, they can also suggest another one
                or move it to their office.
              </p>
            </div>
          )}
        </div>
      )}

      <div className="mt-4">
        <label className={labelClass} htmlFor="agenda">
          What do you want to discuss? <span className="font-normal">(optional)</span>
        </label>
        <textarea
          id="agenda"
          value={agenda}
          onChange={(e) => setAgenda(e.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="Plot size, floors you have in mind, budget, timeline…"
          className={inputClass}
        />
      </div>

      {error && <p className="mt-4 alert alert-danger">{error}</p>}

      <button
        type="button"
        onClick={handleBook}
        disabled={
          saving ||
          !startAt ||
          (mode === MeetingMode.IN_PERSON &&
            venueChoice === "PROPOSE" &&
            venuePlace.trim().length < 3)
        }
        className="mt-5 rounded-full btn-primary px-8 py-3 text-sm disabled:opacity-60"
      >
        {saving ? "Booking…" : startAt ? `Book ${dhakaTimeLabel(startAt)}` : "Pick a time first"}
      </button>
    </div>
  );
}
