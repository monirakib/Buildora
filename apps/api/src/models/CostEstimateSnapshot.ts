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

/**
 * One price row this estimate was actually built from.
 *
 * Copied rather than referenced, and that is the whole point. A reference would
 * only be as good as the row it points at; copying the figure means this
 * estimate stays explainable even if the price row is later corrected, and the
 * `priceId` is still there for anyone who wants to go and look at the original.
 *
 * MarketPrice is append-only for the same reason — between the two, "what did
 * this estimate know, and where did it get it?" has an answer forever.
 */
export interface UsedPriceDoc {
  priceId: string;
  category: string;
  itemLabel: string;
  unit: string;
  priceBdt: number;
  source: string;
  sourceName: string;
  sourceUrl?: string;
  /** How the retrieval got here — SEMANTIC, CATEGORY, STALE_FALLBACK. */
  resolution: string;
  /** Cosine score, when an embedding picked this row. */
  similarity?: number;
  /** Age in days at the moment this estimate was calculated, not now. */
  ageDays: number;
  effectiveFrom: Date;
}

/**
 * The pricing provenance of one estimate — phase 4's whole job.
 *
 * Without this an estimate is a number with a date on it. With it, an owner (or
 * a supervisor, or a contractor disputing a figure) can ask *why* March's
 * estimate differed from August's and get a real answer: these prices, from
 * these sources, this many days old, gathered by that refresh run.
 */
export interface PricingProvenanceDoc {
  /** The refresh run whose prices these are — the price "version". */
  priceRun?: Types.ObjectId;
  /** When that run finished, denormalised so reading it needs no join. */
  pricedAt?: Date;
  prices: UsedPriceDoc[];
  linesRepriced: number;
  linesWithFallback: number;
  /** The total before repricing, so the shift is visible rather than implied. */
  originalTotalBdt: number;
  /** How wages were adjusted, e.g. "2026-03 to 2026-08". Null when no index. */
  labourBasis?: string | null;
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
  /** Which prices produced this figure. Absent on snapshots predating phase 4. */
  pricing?: PricingProvenanceDoc;
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
    pricing: {
      type: new Schema<PricingProvenanceDoc>(
        {
          priceRun: { type: Schema.Types.ObjectId, ref: "PriceRefreshRun" },
          pricedAt: { type: Date },
          prices: {
            type: [
              {
                _id: false,
                priceId: String,
                category: String,
                itemLabel: String,
                unit: String,
                priceBdt: Number,
                source: String,
                sourceName: String,
                sourceUrl: String,
                resolution: String,
                similarity: Number,
                ageDays: Number,
                effectiveFrom: Date,
              },
            ],
            default: [],
          },
          linesRepriced: { type: Number, default: 0 },
          linesWithFallback: { type: Number, default: 0 },
          originalTotalBdt: { type: Number, default: 0 },
          labourBasis: { type: String, default: null },
        },
        { _id: false }
      ),
      required: false,
    },
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
