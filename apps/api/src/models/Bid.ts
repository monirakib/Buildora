import { Schema, model, Types } from "mongoose";
import { BidStatus } from "@buildora/shared";

/**
 * One contractor's sealed offer on a tender.
 *
 * "Sealed" is enforced in the controllers, not here: while the tender is OPEN
 * nobody may read a bid they didn't write, including the owner. This model's
 * job is to make sure a contractor has exactly one bid per tender, which the
 * unique index below guarantees — pricing twice would let someone submit a
 * high bid early and undercut themselves after seeing how quiet it was.
 *
 * `amountBdt` on each line and `totalBdt` are computed on the server from the
 * tender's own quantities. A client sends rates and nothing else, so a bid can
 * never claim a total its own rates don't add up to.
 */
export interface BidLineDoc {
  itemId: string;
  ratePerUnitBdt: number;
  amountBdt: number;
}

export interface BidDoc {
  tender: Types.ObjectId;
  contractor: Types.ObjectId;
  lines: BidLineDoc[];
  totalBdt: number;
  timelineWeeks: number;
  validityDays: number;
  coverLetter?: string;
  status: BidStatus;
  submittedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const bidLineSchema = new Schema<BidLineDoc>(
  {
    itemId: { type: String, required: true, trim: true, maxlength: 40 },
    ratePerUnitBdt: { type: Number, required: true, min: 0 },
    amountBdt: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const bidSchema = new Schema<BidDoc>(
  {
    // Covered by the unique compound index below.
    tender: { type: Schema.Types.ObjectId, ref: "Tender", required: true },
    // Covered by the {contractor, createdAt} index below.
    contractor: { type: Schema.Types.ObjectId, ref: "User", required: true },
    lines: { type: [bidLineSchema], default: [] },
    totalBdt: { type: Number, required: true, min: 0 },
    timelineWeeks: { type: Number, required: true, min: 1, max: 520 },
    validityDays: { type: Number, required: true, min: 1, max: 365 },
    coverLetter: { type: String, trim: true, maxlength: 3000 },
    status: {
      type: String,
      enum: Object.values(BidStatus),
      default: BidStatus.SUBMITTED,
      required: true,
    },
    submittedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

/** One bid per contractor per tender. Re-submitting edits the existing one. */
bidSchema.index({ tender: 1, contractor: 1 }, { unique: true });

// The comparison view reads every bid on a tender, cheapest first.
bidSchema.index({ tender: 1, totalBdt: 1 });

/**
 * A contractor's own bid history (`/api/bids/mine`), newest-first. The
 * standalone `contractor` index on the field above is replaced by this, since
 * that list always sorts by date.
 */
bidSchema.index({ contractor: 1, createdAt: -1 });

export const Bid = model<BidDoc>("Bid", bidSchema);
