import { Schema, model, Types } from "mongoose";
import {
  MeetingMode,
  MeetingStatus,
  type MeetingParty,
  type VenueProposal,
} from "@buildora/shared";

/**
 * A booked meeting between a land owner and an architect.
 *
 * Times are stored as real instants (UTC). The Dhaka wall-clock reading that
 * the architect's availability rules are written in only matters while slots
 * are being *generated* — once a slot is taken, it's just a moment in time.
 *
 * The venue sub-document only applies to IN_PERSON meetings. Its rule: the
 * architect's office is always an available landing point, so a negotiation can
 * never deadlock — whoever is being asked can accept the proposal, counter with
 * another place, or fall back to the office and confirm the meeting outright.
 */
export interface MeetingDoc {
  landOwner: Types.ObjectId;
  architect: Types.ObjectId;
  startAt: Date;
  endAt: Date;
  mode: MeetingMode;
  status: MeetingStatus;
  agenda?: string;
  venue?: {
    isOffice: boolean;
    place?: string;
    awaitingFrom?: MeetingParty;
    history: VenueProposal[];
  };
  /** The architect's office address as it read when the meeting was booked. */
  officeAddress?: string;
  cancelledBy?: MeetingParty;
  cancelReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const venueProposalSchema = new Schema<VenueProposal>(
  {
    place: { type: String, required: true, trim: true, maxlength: 300 },
    by: { type: String, enum: ["LAND_OWNER", "ARCHITECT"], required: true },
    at: { type: String, required: true },
    outcome: {
      type: String,
      enum: ["PENDING", "ACCEPTED", "REJECTED"],
      default: "PENDING",
      required: true,
    },
  },
  { _id: false }
);

const venueSchema = new Schema(
  {
    isOffice: { type: Boolean, required: true, default: true },
    place: { type: String, trim: true, maxlength: 300 },
    awaitingFrom: { type: String, enum: ["LAND_OWNER", "ARCHITECT"] },
    history: { type: [venueProposalSchema], default: [] },
  },
  { _id: false }
);

const meetingSchema = new Schema<MeetingDoc>(
  {
    landOwner: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    architect: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },
    mode: { type: String, enum: Object.values(MeetingMode), required: true },
    status: {
      type: String,
      enum: Object.values(MeetingStatus),
      default: MeetingStatus.CONFIRMED,
      required: true,
    },
    agenda: { type: String, trim: true, maxlength: 1000 },
    venue: { type: venueSchema, default: undefined },
    officeAddress: { type: String, trim: true },
    cancelledBy: { type: String, enum: ["LAND_OWNER", "ARCHITECT"] },
    cancelReason: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true }
);

// The two hot queries: "is this architect's slot already taken?" (status +
// time range) and "show me my meetings, soonest first" for either side.
meetingSchema.index({ architect: 1, startAt: 1, status: 1 });
meetingSchema.index({ landOwner: 1, startAt: -1 });

/**
 * Statuses that occupy a slot. A PENDING_VENUE meeting holds its time even
 * though the place isn't settled — that's the whole point of holding it while
 * the two sides agree on where to meet.
 */
export const BLOCKING_STATUSES = [MeetingStatus.CONFIRMED, MeetingStatus.PENDING_VENUE];

/**
 * One live meeting per architect per start time, enforced by the database.
 *
 * Checking "is this slot free?" in the controller and then inserting is two
 * steps, and two land owners clicking the same 3pm slot at the same moment can
 * both pass the check before either insert lands. A unique index closes that
 * window: the second insert fails with a duplicate-key error, which the
 * controller turns into "that slot was just taken". Cancelled meetings are
 * excluded from the index so the freed time can be booked again.
 */
meetingSchema.index(
  { architect: 1, startAt: 1 },
  { unique: true, partialFilterExpression: { status: { $in: BLOCKING_STATUSES } } }
);

export const Meeting = model<MeetingDoc>("Meeting", meetingSchema);
