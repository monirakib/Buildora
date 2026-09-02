import { Schema, model } from "mongoose";
import { PriceSource, ProductCategory } from "@buildora/shared";

/**
 * One material price, as observed at one moment.
 *
 * **This collection is append-only, and that is the whole design.** When cement
 * moves, nothing here is edited — a new row is written and the old one stays
 * untouched. Reading "the current price" means reading the newest effective row,
 * not the only row.
 *
 * The reason is auditability. An estimate produced in March has to still be
 * explainable in August, and it cannot be if the prices behind it were
 * overwritten in the meantime. CostEstimateSnapshot already works this way for
 * exactly the same reason; this is the same idea one layer down.
 *
 * Three sources feed it and they are not equal:
 *
 *   - CURATED rows come from the admin's weekly price sheet — typed into the
 *     console or uploaded as a CSV (services/priceSheet). Slow, reliable, and
 *     the floor everything else falls back to. This is the source a person is
 *     responsible for keeping current, and the only one that covers categories
 *     no supplier happens to be listing this week.
 *   - MARKETPLACE rows are medians of live listings on Buildora itself. This is
 *     our own users' data — no scraping, no third-party terms in the way — and
 *     it is the only source that moves without anyone doing anything.
 *   - FETCHED rows come from the weekly job reading a manufacturer's public
 *     price page. They land with `approved: false` and stay inert until an admin
 *     says otherwise, because a parser meeting a redesigned page should produce
 *     a pending row for review, never a moved estimate.
 */
export interface MarketPriceDoc {
  category: ProductCategory;
  /** What was actually priced, e.g. "OPC cement, 50kg bag". */
  itemLabel: string;
  unit: string;
  priceBdt: number;
  source: PriceSource;
  /** Where it came from, so a person can check the claim. */
  sourceName: string;
  sourceUrl?: string;
  /** Only FETCHED rows ever land false — see the note above. */
  approved: boolean;
  /**
   * Marks the item as no longer sold, or no longer worth tracking.
   *
   * Retiring cannot delete anything — that would break the audit trail this
   * collection exists for. Instead a final row is written with this set, and
   * because reads take the *newest* row per item, that one shadows the rest and
   * the item drops out of both the sheet and the estimator's candidate list.
   * The history underneath stays readable, so an estimate from March that used
   * this item can still be explained.
   */
  retired?: boolean;
  /**
   * When this price started applying. Distinct from `createdAt`: an admin
   * entering last week's TCB bulletin today should backdate it, or the staleness
   * check will believe the figure is fresher than it is.
   */
  effectiveFrom: Date;
  /**
   * Reserved for the weekly job (phase 2), which embeds `itemLabel` with
   * transformers.js so retrieval can match "cement" to "OPC cement, 50kg bag"
   * without an exact string hit. Declared here rather than added later so the
   * collection never needs a migration; nothing reads it yet.
   */
  embedding?: number[];
  /** Which model produced `embedding`, so a model change can re-embed only what's stale. */
  embeddingModel?: string;
  createdAt: Date;
  updatedAt: Date;
}

const marketPriceSchema = new Schema<MarketPriceDoc>(
  {
    category: { type: String, enum: Object.values(ProductCategory), required: true },
    itemLabel: { type: String, required: true, trim: true, maxlength: 120 },
    unit: { type: String, required: true, trim: true, maxlength: 30 },
    priceBdt: { type: Number, required: true, min: 0 },
    source: { type: String, enum: Object.values(PriceSource), required: true },
    sourceName: { type: String, required: true, trim: true, maxlength: 120 },
    sourceUrl: { type: String, trim: true, maxlength: 500 },
    // Curated and marketplace rows are trusted on arrival; only the scraper's
    // output has to be looked at first, and the seed/job set this explicitly.
    approved: { type: Boolean, required: true, default: false },
    retired: { type: Boolean, default: undefined },
    effectiveFrom: { type: Date, required: true, default: () => new Date() },
    embedding: { type: [Number], default: undefined },
    embeddingModel: { type: String, trim: true, maxlength: 80 },
  },
  { timestamps: true }
);

/**
 * The read that matters: "the newest approved price for this category".
 *
 * Equality fields first (`category`, `approved`), then the sort key descending,
 * so answering it is a walk of a contiguous run of index entries with no sort
 * step — the same shape as the Product indexes.
 */
marketPriceSchema.index({ category: 1, approved: 1, effectiveFrom: -1 });

/** The admin review queue: everything still waiting, oldest first. */
marketPriceSchema.index({ approved: 1, createdAt: 1 });

export const MarketPrice = model<MarketPriceDoc>("MarketPrice", marketPriceSchema);
