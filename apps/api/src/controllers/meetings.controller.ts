import type { Request, Response } from "express";
import { isValidObjectId, type HydratedDocument } from "mongoose";
import { z } from "zod";
import {
  DEFAULT_AVAILABILITY,
  MeetingMode,
  MeetingStatus,
  NotificationType,
  SLOT_MINUTE_OPTIONS,
  UserRole,
  VerificationStatus,
  dhakaDateLabel,
  dhakaTimeLabel,
  minutesFromHhmm,
  type Availability as AvailabilityDto,
  type Meeting as MeetingDto,
  type MeetingParticipant,
  type MeetingParty,
  type ProfessionalProfile,
  type SlotDay,
} from "@buildora/shared";
import { Availability, type AvailabilityDoc } from "../models/Availability";
import { BLOCKING_STATUSES, Meeting, type MeetingDoc } from "../models/Meeting";
import { User } from "../models/User";
import { notify, preview } from "../services/notifications";
import { generateSlotDays, isSlotAvailable } from "../services/slots";

/**
 * Meeting scheduling.
 *
 * The shape of the feature:
 *   - An architect publishes weekly hours (models/Availability).
 *   - A land owner sees the free slots those hours imply, minus the meetings
 *     already booked, and takes one.
 *   - An online meeting is confirmed immediately. So is an in-person meeting at
 *     the architect's office. Only an in-person meeting at *some other place*
 *     starts as PENDING_VENUE, while the two sides agree where to meet.
 *
 * Getting a meeting onto someone's real calendar is handled entirely in the
 * browser: each meeting card offers an "Add to Google Calendar" link and an
 * .ics download (apps/web/src/lib/calendarLinks.ts). That needs no Google
 * account, no API key and no permission grant, so it works for every visitor —
 * which is why there is no calendar integration on the server at all.
 */

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** A populated participant ref, as it comes back from `.populate()`. */
type PopulatedUser = {
  _id: unknown;
  name: string;
  username: string;
  role: UserRole;
  profile?: { company?: string; avatarUrl?: string; officeAddress?: string };
};

const withParticipants = [
  { path: "landOwner", select: "name username role profile.company profile.avatarUrl" },
  { path: "architect", select: "name username role profile.company profile.avatarUrl" },
];

function toParticipant(user: PopulatedUser): MeetingParticipant {
  return {
    id: String(user._id),
    name: user.name,
    username: user.username,
    role: user.role,
    company: user.profile?.company,
    avatarUrl: user.profile?.avatarUrl,
  };
}

/** Shapes a meeting (with both sides populated) for the client. */
function toMeetingDto(doc: HydratedDocument<MeetingDoc>): MeetingDto {
  const landOwner = doc.landOwner as unknown as PopulatedUser;
  const architect = doc.architect as unknown as PopulatedUser;
  return {
    id: doc._id.toString(),
    landOwner: toParticipant(landOwner),
    architect: toParticipant(architect),
    startAt: doc.startAt.toISOString(),
    endAt: doc.endAt.toISOString(),
    mode: doc.mode,
    status: doc.status,
    agenda: doc.agenda,
    venue: doc.venue
      ? {
          isOffice: doc.venue.isOffice,
          place: doc.venue.place,
          awaitingFrom: doc.venue.awaitingFrom,
          history: doc.venue.history ?? [],
        }
      : undefined,
    officeAddress: doc.officeAddress,
    cancelledBy: doc.cancelledBy,
    cancelReason: doc.cancelReason,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

function toAvailabilityDto(doc: HydratedDocument<AvailabilityDoc>): AvailabilityDto {
  return {
    slotMinutes: doc.slotMinutes,
    rules: doc.rules.map((r) => ({ weekday: r.weekday, start: r.start, end: r.end })),
    blackoutDates: doc.blackoutDates,
    minNoticeHours: doc.minNoticeHours,
    maxAdvanceDays: doc.maxAdvanceDays,
    published: doc.published,
    updatedAt: doc.updatedAt.toISOString(),
  };
}

/** Which side of this meeting the signed-in user is on, if either. */
function partyOf(doc: HydratedDocument<MeetingDoc>, userId: string): MeetingParty | null {
  if (
    String(doc.landOwner) === userId ||
    String((doc.landOwner as never as PopulatedUser)._id) === userId
  )
    return "LAND_OWNER";
  if (
    String(doc.architect) === userId ||
    String((doc.architect as never as PopulatedUser)._id) === userId
  )
    return "ARCHITECT";
  return null;
}

/**
 * `UserProfile` is a union of the land-owner and professional shapes, so
 * professional-only fields need the narrowing cast the rest of the codebase
 * uses (see professionals.controller.ts).
 */
function officeAddressOf(user: { profile?: unknown } | null): string | undefined {
  return ((user?.profile ?? {}) as ProfessionalProfile).officeAddress;
}

const otherParty = (party: MeetingParty): MeetingParty =>
  party === "LAND_OWNER" ? "ARCHITECT" : "LAND_OWNER";

/** "Sun, 16 Aug 2026 at 3:00 pm" — one phrase, used in every notification. */
function whenLabel(doc: MeetingDoc): string {
  return `${dhakaDateLabel(doc.startAt)} at ${dhakaTimeLabel(doc.startAt)}`;
}

/** The user id on a given side of a meeting, populated or not. */
function idOf(doc: HydratedDocument<MeetingDoc>, party: MeetingParty): string {
  const ref = party === "LAND_OWNER" ? doc.landOwner : doc.architect;
  const maybePopulated = ref as unknown as PopulatedUser;
  return String(maybePopulated?._id ?? ref);
}

function nameOf(doc: HydratedDocument<MeetingDoc>, party: MeetingParty): string {
  const ref = (party === "LAND_OWNER" ? doc.landOwner : doc.architect) as unknown as PopulatedUser;
  return ref?.name ?? "the other side";
}

// ---------------------------------------------------------------------------
// Availability (architect-facing)
// ---------------------------------------------------------------------------

const ruleInput = z
  .object({
    weekday: z.number().int().min(0).max(6),
    start: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM times"),
    end: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM times"),
  })
  .refine((r) => minutesFromHhmm(r.end) > minutesFromHhmm(r.start), {
    message: "Each block must end after it starts",
  });

const availabilityInput = z.object({
  slotMinutes: z.number().refine((n) => (SLOT_MINUTE_OPTIONS as readonly number[]).includes(n), {
    message: "Pick one of the offered meeting lengths",
  }),
  rules: z.array(ruleInput).max(50, "That's too many time blocks"),
  blackoutDates: z
    .array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD dates"))
    .max(120)
    .default([]),
  minNoticeHours: z.number().int().min(0).max(168),
  maxAdvanceDays: z.number().int().min(1).max(180),
  published: z.boolean(),
});

/** GET /api/meetings/availability — the architect's own hours. */
export async function getMyAvailability(req: Request, res: Response) {
  const doc = await Availability.findOne({ architect: req.auth!.sub });
  const user = await User.findById(req.auth!.sub).select("profile.officeAddress");
  return res.json({
    data: {
      availability: doc ? toAvailabilityDto(doc) : DEFAULT_AVAILABILITY,
      // The booking form needs to know whether "meet at my office" is even an
      // option, and the editor warns the architect when it isn't.
      officeAddress: officeAddressOf(user),
    },
  });
}

/** PUT /api/meetings/availability — replace the architect's hours. */
export async function saveMyAvailability(req: Request, res: Response) {
  const parsed = availabilityInput.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: { message: parsed.error.issues[0]?.message ?? "Invalid input" } });
  }
  const input = parsed.data;

  if (input.published && input.rules.length === 0) {
    return res
      .status(400)
      .json({ error: { message: "Add at least one time block before opening your calendar" } });
  }

  const doc = await Availability.findOneAndUpdate(
    { architect: req.auth!.sub },
    { architect: req.auth!.sub, ...input },
    { upsert: true, new: true }
  );
  return res.json({ data: { availability: toAvailabilityDto(doc!) } });
}

// ---------------------------------------------------------------------------
// Slots (land-owner facing)
// ---------------------------------------------------------------------------

/**
 * Loads everything the slot generator needs for one architect and runs it.
 * Shared by the browse endpoint and by booking/rescheduling, so the calendar a
 * land owner sees and the rule the server enforces are the same computation.
 *
 * `ignoreMeetingId` lets a meeting being rescheduled ignore the slot it is
 * itself sitting in.
 */
async function loadSlotDays(
  architectId: string,
  availability: AvailabilityDto,
  ignoreMeetingId?: string
): Promise<SlotDay[]> {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + availability.maxAdvanceDays * 24 * 60 * 60_000);

  const booked = await Meeting.find({
    architect: architectId,
    status: { $in: BLOCKING_STATUSES },
    startAt: { $gte: now, $lte: windowEnd },
    ...(ignoreMeetingId ? { _id: { $ne: ignoreMeetingId } } : {}),
  }).select("startAt endAt");

  return generateSlotDays({
    availability,
    booked: booked.map((m) => ({ start: m.startAt, end: m.endAt })),
    now,
  });
}

/** GET /api/meetings/architects/:id/slots — an architect's open times. */
export async function getArchitectSlots(req: Request, res: Response) {
  // `id` comes straight from req.params, which Express 5 types as string | string[].
  const id = req.params.id;
  if (typeof id !== "string" || !isValidObjectId(id)) {
    return res.status(400).json({ error: { message: "Invalid architect id" } });
  }

  const architect = await User.findById(id).select("role verificationStatus profile.officeAddress");
  if (!architect || architect.role !== UserRole.ARCHITECT) {
    return res.status(404).json({ error: { message: "Architect not found" } });
  }
  if (architect.verificationStatus !== VerificationStatus.APPROVED) {
    return res.json({
      data: {
        bookable: false,
        reason: "This architect isn't Platform Verified yet, so their calendar isn't open.",
        days: [],
      },
    });
  }

  const availabilityDoc = await Availability.findOne({ architect: id });
  if (!availabilityDoc?.published) {
    return res.json({
      data: {
        bookable: false,
        reason: "This architect hasn't opened their meeting calendar yet.",
        days: [],
      },
    });
  }

  const availability = toAvailabilityDto(availabilityDoc);
  const days = await loadSlotDays(id, availability);

  return res.json({
    data: {
      bookable: true,
      slotMinutes: availability.slotMinutes,
      officeAddress: officeAddressOf(architect),
      days,
    },
  });
}

// ---------------------------------------------------------------------------
// Booking
// ---------------------------------------------------------------------------

const bookInput = z.object({
  architectId: z.string().min(1, "Choose an architect"),
  startAt: z.string().min(1, "Pick a time"),
  mode: z.enum(MeetingMode, { message: "Choose how you'll meet" }),
  agenda: z.string().trim().max(1000, "That's a bit long").optional(),
  // In-person only: meet at the office, or propose somewhere else.
  venueChoice: z.enum(["OFFICE", "PROPOSE"]).optional(),
  venuePlace: z.string().trim().max(300, "That's a bit long").optional(),
});

/** POST /api/meetings — a land owner takes a slot. */
export async function bookMeeting(req: Request, res: Response) {
  const parsed = bookInput.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: { message: parsed.error.issues[0]?.message ?? "Invalid input" } });
  }
  const { architectId, mode, agenda, venueChoice, venuePlace } = parsed.data;

  if (!isValidObjectId(architectId)) {
    return res.status(400).json({ error: { message: "Invalid architect id" } });
  }
  const startAt = new Date(parsed.data.startAt);
  if (Number.isNaN(startAt.getTime())) {
    return res.status(400).json({ error: { message: "That start time isn't a valid date" } });
  }

  const architect = await User.findById(architectId).select(
    "name role verificationStatus profile.officeAddress"
  );
  if (!architect || architect.role !== UserRole.ARCHITECT) {
    return res.status(404).json({ error: { message: "Architect not found" } });
  }
  if (architect.verificationStatus !== VerificationStatus.APPROVED) {
    return res
      .status(400)
      .json({ error: { message: "You can only book meetings with Platform Verified architects" } });
  }

  const availabilityDoc = await Availability.findOne({ architect: architectId });
  if (!availabilityDoc?.published) {
    return res
      .status(400)
      .json({ error: { message: "This architect hasn't opened their meeting calendar yet" } });
  }
  const availability = toAvailabilityDto(availabilityDoc);

  // Work out the venue up front, so an impossible combination fails before the
  // slot is taken rather than after.
  const officeAddress = officeAddressOf(architect);
  let venue: MeetingDoc["venue"];
  let status = MeetingStatus.CONFIRMED;

  if (mode === MeetingMode.IN_PERSON) {
    if (venueChoice === "PROPOSE") {
      if (!venuePlace || venuePlace.length < 3) {
        return res.status(400).json({ error: { message: "Say where you'd like to meet" } });
      }
      // The place isn't settled until the architect answers, so the meeting
      // holds its time as PENDING_VENUE.
      status = MeetingStatus.PENDING_VENUE;
      venue = {
        isOffice: false,
        place: venuePlace,
        awaitingFrom: "ARCHITECT",
        history: [
          { place: venuePlace, by: "LAND_OWNER", at: new Date().toISOString(), outcome: "PENDING" },
        ],
      };
    } else {
      if (!officeAddress) {
        return res.status(400).json({
          error: {
            message: "This architect hasn't listed an office address, propose a place instead",
          },
        });
      }
      venue = { isOffice: true, history: [] };
    }
  }

  // The one source of truth for "is this bookable": the same generator the
  // land owner's calendar was drawn from.
  const days = await loadSlotDays(architectId, availability);
  const slot = isSlotAvailable(days, startAt);
  if (!slot) {
    return res
      .status(409)
      .json({ error: { message: "That time isn't available any more, pick another slot" } });
  }

  // Don't let a land owner book two meetings at once, with anyone.
  const clash = await Meeting.findOne({
    landOwner: req.auth!.sub,
    status: { $in: BLOCKING_STATUSES },
    startAt: { $lt: new Date(slot.endAt) },
    endAt: { $gt: new Date(slot.startAt) },
  });
  if (clash) {
    return res
      .status(409)
      .json({ error: { message: "You already have a meeting booked at that time" } });
  }

  let doc: HydratedDocument<MeetingDoc>;
  try {
    doc = await Meeting.create({
      landOwner: req.auth!.sub,
      architect: architectId,
      startAt: new Date(slot.startAt),
      endAt: new Date(slot.endAt),
      mode,
      status,
      agenda,
      venue,
      officeAddress,
    });
  } catch (err) {
    // The unique partial index on (architect, startAt) fired — somebody else
    // took this slot in the moment between the check above and this insert.
    if ((err as { code?: number }).code === 11000) {
      return res
        .status(409)
        .json({ error: { message: "Someone just took that slot, pick another time" } });
    }
    throw err;
  }

  await doc.populate(withParticipants);

  const bookerName = nameOf(doc, "LAND_OWNER");
  await notify(architectId, {
    type: NotificationType.MEETING,
    title:
      status === MeetingStatus.PENDING_VENUE
        ? `${bookerName} proposed a meeting place`
        : `${bookerName} booked a meeting`,
    body:
      status === MeetingStatus.PENDING_VENUE
        ? `${whenLabel(doc)}. They'd like to meet at ${preview(venuePlace!, 80)}. Accept it, suggest another place, or move it to your office.`
        : whenLabel(doc),
    link: "/meetings",
    actorId: req.auth!.sub,
  });

  return res.status(201).json({ data: { meeting: toMeetingDto(doc) } });
}

/** GET /api/meetings — every meeting the signed-in user is part of. */
export async function listMyMeetings(req: Request, res: Response) {
  const userId = req.auth!.sub;
  const docs = await Meeting.find({ $or: [{ landOwner: userId }, { architect: userId }] })
    .sort({ startAt: 1 })
    .populate(withParticipants);

  return res.json({ data: { meetings: docs.map(toMeetingDto) } });
}

// ---------------------------------------------------------------------------
// Venue negotiation (in-person meetings only)
// ---------------------------------------------------------------------------

/**
 * Loads a meeting and checks the caller is on it. Returns the document and
 * which side they're on, or sends the error response itself.
 */
async function loadOwnMeeting(
  req: Request,
  res: Response
): Promise<{ doc: HydratedDocument<MeetingDoc>; party: MeetingParty } | null> {
  const { id } = req.params;
  if (!isValidObjectId(id)) {
    res.status(400).json({ error: { message: "Invalid meeting id" } });
    return null;
  }
  const doc = await Meeting.findById(id).populate(withParticipants);
  if (!doc) {
    res.status(404).json({ error: { message: "Meeting not found" } });
    return null;
  }
  const party = partyOf(doc, req.auth!.sub);
  if (!party) {
    res.status(403).json({ error: { message: "That isn't your meeting" } });
    return null;
  }
  return { doc, party };
}

/** Marks the outstanding proposal as answered. */
function closePendingProposal(doc: HydratedDocument<MeetingDoc>, outcome: "ACCEPTED" | "REJECTED") {
  const pending = doc.venue?.history.filter((h) => h.outcome === "PENDING") ?? [];
  for (const entry of pending) entry.outcome = outcome;
}

/**
 * Guard shared by the three venue actions: the meeting must be an in-person one
 * still waiting on *this* user to answer.
 */
function assertCanAnswerVenue(
  doc: HydratedDocument<MeetingDoc>,
  party: MeetingParty,
  res: Response
): boolean {
  if (doc.status !== MeetingStatus.PENDING_VENUE) {
    res.status(400).json({ error: { message: "This meeting's place is already settled" } });
    return false;
  }
  if (doc.venue?.awaitingFrom !== party) {
    res.status(400).json({ error: { message: "It's the other side's turn to answer" } });
    return false;
  }
  return true;
}

/** POST /api/meetings/:id/venue — counter with a different place. */
export async function proposeVenue(req: Request, res: Response) {
  const loaded = await loadOwnMeeting(req, res);
  if (!loaded) return;
  const { doc, party } = loaded;
  if (!assertCanAnswerVenue(doc, party, res)) return;

  const parsed = z
    .object({ place: z.string().trim().min(3, "Say where you'd like to meet").max(300) })
    .safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: { message: parsed.error.issues[0]?.message ?? "Invalid input" } });
  }
  const { place } = parsed.data;

  // Their proposal is turned down and replaced by ours; the ball goes back.
  closePendingProposal(doc, "REJECTED");
  doc.venue!.place = place;
  doc.venue!.isOffice = false;
  doc.venue!.awaitingFrom = otherParty(party);
  doc.venue!.history.push({
    place,
    by: party,
    at: new Date().toISOString(),
    outcome: "PENDING",
  });
  await doc.save();

  await notify(idOf(doc, otherParty(party)), {
    type: NotificationType.MEETING,
    title: `${nameOf(doc, party)} suggested a different place`,
    body: `${whenLabel(doc)}, they'd rather meet at ${preview(place, 80)}.`,
    link: "/meetings",
    actorId: req.auth!.sub,
  });

  return res.json({ data: { meeting: toMeetingDto(doc) } });
}

/** POST /api/meetings/:id/venue/accept — agree to the proposed place. */
export async function acceptVenue(req: Request, res: Response) {
  const loaded = await loadOwnMeeting(req, res);
  if (!loaded) return;
  const { doc, party } = loaded;
  if (!assertCanAnswerVenue(doc, party, res)) return;

  closePendingProposal(doc, "ACCEPTED");
  doc.venue!.isOffice = false;
  doc.venue!.awaitingFrom = undefined;
  doc.status = MeetingStatus.CONFIRMED;
  await doc.save();

  await notify(idOf(doc, otherParty(party)), {
    type: NotificationType.MEETING,
    title: "Meeting confirmed",
    body: `${nameOf(doc, party)} agreed to meet at ${preview(doc.venue!.place ?? "", 80)}, ${whenLabel(doc)}.`,
    link: "/meetings",
    actorId: req.auth!.sub,
  });

  return res.json({ data: { meeting: toMeetingDto(doc) } });
}

/**
 * POST /api/meetings/:id/venue/office — settle at the architect's office.
 *
 * Open to *either* side, not just whoever's turn it is: the office is the
 * agreed fallback, so letting anyone land on it is what guarantees a
 * negotiation can always end.
 */
export async function chooseOfficeVenue(req: Request, res: Response) {
  const loaded = await loadOwnMeeting(req, res);
  if (!loaded) return;
  const { doc, party } = loaded;

  if (doc.status !== MeetingStatus.PENDING_VENUE) {
    return res.status(400).json({ error: { message: "This meeting's place is already settled" } });
  }
  if (!doc.officeAddress) {
    return res
      .status(400)
      .json({ error: { message: "There's no office address on file for this architect" } });
  }

  closePendingProposal(doc, "REJECTED");
  doc.venue!.isOffice = true;
  doc.venue!.place = undefined;
  doc.venue!.awaitingFrom = undefined;
  doc.status = MeetingStatus.CONFIRMED;
  await doc.save();

  await notify(idOf(doc, otherParty(party)), {
    type: NotificationType.MEETING,
    title: "Meeting confirmed at the office",
    body: `${nameOf(doc, party)} settled on ${preview(doc.officeAddress, 80)}, ${whenLabel(doc)}.`,
    link: "/meetings",
    actorId: req.auth!.sub,
  });

  return res.json({ data: { meeting: toMeetingDto(doc) } });
}

// ---------------------------------------------------------------------------
// Cancel and reschedule
// ---------------------------------------------------------------------------

/** POST /api/meetings/:id/cancel — either side calls it off. */
export async function cancelMeeting(req: Request, res: Response) {
  const loaded = await loadOwnMeeting(req, res);
  if (!loaded) return;
  const { doc, party } = loaded;

  if (doc.status === MeetingStatus.CANCELLED) {
    return res.status(400).json({ error: { message: "This meeting is already cancelled" } });
  }
  if (doc.endAt < new Date()) {
    return res.status(400).json({ error: { message: "That meeting has already happened" } });
  }

  const parsed = z
    .object({ reason: z.string().trim().max(500).optional() })
    .safeParse(req.body ?? {});
  const reason = parsed.success ? parsed.data.reason : undefined;

  doc.status = MeetingStatus.CANCELLED;
  doc.cancelledBy = party;
  doc.cancelReason = reason;
  if (doc.venue) doc.venue.awaitingFrom = undefined;
  await doc.save();

  await notify(idOf(doc, otherParty(party)), {
    type: NotificationType.MEETING,
    title: `${nameOf(doc, party)} cancelled your meeting`,
    body: reason ? `${whenLabel(doc)}, ${preview(reason, 100)}` : whenLabel(doc),
    link: "/meetings",
    actorId: req.auth!.sub,
  });

  return res.json({ data: { meeting: toMeetingDto(doc) } });
}

/** POST /api/meetings/:id/reschedule — either side moves it to another slot. */
export async function rescheduleMeeting(req: Request, res: Response) {
  const loaded = await loadOwnMeeting(req, res);
  if (!loaded) return;
  const { doc, party } = loaded;

  if (doc.status === MeetingStatus.CANCELLED) {
    return res.status(400).json({ error: { message: "This meeting was cancelled" } });
  }
  if (doc.endAt < new Date()) {
    return res.status(400).json({ error: { message: "That meeting has already happened" } });
  }

  const parsed = z.object({ startAt: z.string().min(1, "Pick a new time") }).safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: { message: parsed.error.issues[0]?.message ?? "Invalid input" } });
  }
  const startAt = new Date(parsed.data.startAt);
  if (Number.isNaN(startAt.getTime())) {
    return res.status(400).json({ error: { message: "That start time isn't a valid date" } });
  }

  const architectId = idOf(doc, "ARCHITECT");
  const availabilityDoc = await Availability.findOne({ architect: architectId });
  if (!availabilityDoc?.published) {
    return res
      .status(400)
      .json({ error: { message: "This architect's calendar is closed right now" } });
  }

  // Ignore this meeting's own slot, so its current time doesn't read as busy.
  const days = await loadSlotDays(
    architectId,
    toAvailabilityDto(availabilityDoc),
    doc._id.toString()
  );
  const slot = isSlotAvailable(days, startAt);
  if (!slot) {
    return res.status(409).json({ error: { message: "That time isn't available, pick another" } });
  }

  const previous = whenLabel(doc);
  doc.startAt = new Date(slot.startAt);
  doc.endAt = new Date(slot.endAt);
  try {
    await doc.save();
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      return res
        .status(409)
        .json({ error: { message: "Someone just took that slot, pick another time" } });
    }
    throw err;
  }

  await notify(idOf(doc, otherParty(party)), {
    type: NotificationType.MEETING,
    title: `${nameOf(doc, party)} moved your meeting`,
    body: `Was ${previous}, now ${whenLabel(doc)}.`,
    link: "/meetings",
    actorId: req.auth!.sub,
  });

  return res.json({ data: { meeting: toMeetingDto(doc) } });
}
