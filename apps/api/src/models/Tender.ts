import { Schema, model, Types } from "mongoose";
import { TenderStatus } from "@buildora/shared";

/**
 * A request for construction bids on one project.
 *
 * The Bill of Quantities carries descriptions, units and quantities but no
 * prices for the contractor to see. `guideRateBdt` is the platform's own
 * estimate, copied from the BoqRate table when the tender is drafted; it is
 * stored so the owner's comparison stays stable even if the rate table moves
 * later, and it is stripped from every payload a contractor receives.
 */
export interface TenderItemDoc {
  id: string;
  description: string;
  unit: string;
  quantity: number;
  guideRateBdt?: number;
}

export interface TenderDoc {
  project: Types.ObjectId;
  owner: Types.ObjectId;
  title: string;
  scope: string;
  items: TenderItemDoc[];
  deadlineAt: Date;
  siteVisitAt?: Date;
  status: TenderStatus;
  estimatedBdt?: number;
  awardedBid?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// Lines are edited as a whole list through tender actions, never individually.
const tenderItemSchema = new Schema<TenderItemDoc>(
  {
    id: { type: String, required: true, trim: true, maxlength: 40 },
    description: { type: String, required: true, trim: true, maxlength: 200 },
    unit: { type: String, required: true, trim: true, maxlength: 20 },
    quantity: { type: Number, required: true, min: 0 },
    guideRateBdt: { type: Number, min: 0 },
  },
  { _id: false }
);

const tenderSchema = new Schema<TenderDoc>(
  {
    // No `index: true` — the unique partial index below covers this key, and
    // declaring both makes Mongoose build the plain one and skip the unique one.
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    scope: { type: String, required: true, trim: true, maxlength: 5000 },
    items: { type: [tenderItemSchema], default: [] },
    deadlineAt: { type: Date, required: true },
    siteVisitAt: { type: Date },
    status: {
      type: String,
      enum: Object.values(TenderStatus),
      default: TenderStatus.DRAFT,
      required: true,
      index: true,
    },
    estimatedBdt: { type: Number, min: 0 },
    awardedBid: { type: Schema.Types.ObjectId, ref: "Bid" },
  },
  { timestamps: true }
);

/** The statuses that mean "this tender is still going". */
export const LIVE_TENDER_STATUSES = [TenderStatus.DRAFT, TenderStatus.OPEN, TenderStatus.CLOSED];

/**
 * One live tender per project. A cancelled or awarded one is excluded, so an
 * owner whose tender drew no bids can start a fresh one.
 */
tenderSchema.index(
  { project: 1 },
  { unique: true, partialFilterExpression: { status: { $in: LIVE_TENDER_STATUSES } } }
);

// The contractor's tender board: everything open, closing soonest first.
tenderSchema.index({ status: 1, deadlineAt: 1 });

export const Tender = model<TenderDoc>("Tender", tenderSchema);
