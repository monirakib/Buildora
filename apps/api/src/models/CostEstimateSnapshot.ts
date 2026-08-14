import { Schema, Types, model } from "mongoose";
import { EstimateTier } from "@buildora/shared";

/**
 * A cost estimate as it stood at one moment.
 *
 * The estimate is not a thing you press a button for any more — it exists from
 * the moment a brief is posted and is recalculated whenever something real
 * lands: the architect saves a floor plan, the owner publishes a BOQ, bidding
 * closes. Storing each one is what lets an owner see the figure tighten instead
 * of having to take "it updates" on trust, and it means a bid can be compared
 * against the estimate that was current when the tender went out rather than
 * one retro-fitted from the bids themselves.
 *
 * Writing these is cheap: the arithmetic is a rate-table read and a
 * multiplication, with no model involved. The narrative is filled in lazily,
 * only when somebody actually opens the estimate.
 */

export interface CostLineDoc {
  description: string;
  category: string;
  unit: string;
  quantity: number;
  ratePerUnitBdt: number;
  totalBdt: number;
}

/** Median marketplace price per category at the time of this snapshot. */
export interface CategoryMedianDoc {
  category: string;
  medianBdt: number;
  listings: number;
}

export interface CostEstimateSnapshotDoc {
  project: Types.ObjectId;
  tier: EstimateTier;
  areaSqft: number;
  /** In words, e.g. "your drawn floor plans" — shown under the figure. */
  areaSource: string;
  floors: number;
  buildingType: string;
  lines: CostLineDoc[];
  byCategory: { category: string; totalBdt: number }[];
  totalBdt: number;
  perSqftBdt: number;
  rangeLowBdt: number;
  rangeHighBdt: number;
  /** The baseline the *next* snapshot measures market movement against. */
  categoryMedians: CategoryMedianDoc[];
  ratesFrom: number;
  narrative?: string;
  createdAt: Date;
  updatedAt: Date;
}

const lineSchema = new Schema<CostLineDoc>(
  {
    description: { type: String, required: true },
    category: { type: String, required: true },
    unit: { type: String, required: true },
    quantity: { type: Number, required: true },
    ratePerUnitBdt: { type: Number, required: true },
    totalBdt: { type: Number, required: true },
  },
  { _id: false }
);

const snapshotSchema = new Schema<CostEstimateSnapshotDoc>(
  {
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    tier: { type: String, enum: Object.values(EstimateTier), required: true },
    areaSqft: { type: Number, required: true },
    areaSource: { type: String, required: true },
    floors: { type: Number, required: true },
    buildingType: { type: String, required: true },
    lines: { type: [lineSchema], default: [] },
    byCategory: {
      type: [{ _id: false, category: String, totalBdt: Number }],
      default: [],
    },
    totalBdt: { type: Number, required: true },
    perSqftBdt: { type: Number, required: true },
    rangeLowBdt: { type: Number, required: true },
    rangeHighBdt: { type: Number, required: true },
    categoryMedians: {
      type: [{ _id: false, category: String, medianBdt: Number, listings: Number }],
      default: [],
    },
    ratesFrom: { type: Number, required: true, default: 0 },
    narrative: { type: String },
  },
  { timestamps: true }
);

// Every read wants the newest snapshot for one project, so index for exactly that.
snapshotSchema.index({ project: 1, createdAt: -1 });

export const CostEstimateSnapshot = model<CostEstimateSnapshotDoc>(
  "CostEstimateSnapshot",
  snapshotSchema
);
