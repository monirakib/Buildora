import { Schema, model } from "mongoose";

/**
 * One execution of the weekly price refresh.
 *
 * This row is doing two jobs at once, and the second is the interesting one.
 *
 * The obvious job is operational: what ran, when, what it wrote, what broke. A
 * scraper that has been silently failing for a month is invisible without it.
 *
 * The second job is **being the price version**. Phase 4 needs every estimate to
 * record which prices it was built from, and the honest way to express that is
 * not a timestamp — it is a pointer to the run that produced those prices.
 * `CostEstimateSnapshot.priceRun` holds this `_id`, so "what did this March
 * estimate actually know?" is answered by reading the run it names and the
 * append-only price rows that run wrote. Nothing has to be reconstructed.
 *
 * Which is also why runs are never deleted or overwritten. An old run is not
 * clutter; it is the only surviving explanation of an old number.
 */
export interface PriceRefreshRunDoc {
  startedAt: Date;
  finishedAt?: Date;
  status: "RUNNING" | "OK" | "PARTIAL" | "FAILED";
  /** What kicked it off, so an unexpected run can be traced. */
  trigger: "CRON" | "ENDPOINT" | "ADMIN" | "LAZY" | "SEED";
  /** New MarketPrice rows written by this run. */
  pricesWritten: number;
  /** Rows given an embedding by this run, new or re-embedded after a model change. */
  pricesEmbedded: number;
  /**
   * Set only by an ADMIN-triggered run: how many projects' estimates were
   * checked against the freshly fetched prices, and how many of those actually
   * moved and got a new snapshot. The other triggers never touch estimates —
   * see recalculateAllEstimates for why a full sweep is reserved for the
   * button an admin presses on purpose.
   */
  estimatesChecked: number;
  estimatesUpdated: number;
  /** Sources that answered, e.g. "marketplace", "Bashundhara Cement". */
  sourcesOk: string[];
  /** Sources that failed, with the reason — the field an admin actually reads. */
  sourcesFailed: { source: string; reason: string }[];
  createdAt: Date;
  updatedAt: Date;
}

const priceRefreshRunSchema = new Schema<PriceRefreshRunDoc>(
  {
    startedAt: { type: Date, required: true, default: () => new Date() },
    finishedAt: { type: Date },
    status: {
      type: String,
      enum: ["RUNNING", "OK", "PARTIAL", "FAILED"],
      required: true,
      default: "RUNNING",
    },
    trigger: {
      type: String,
      enum: ["CRON", "ENDPOINT", "ADMIN", "LAZY", "SEED"],
      required: true,
    },
    pricesWritten: { type: Number, required: true, default: 0 },
    pricesEmbedded: { type: Number, required: true, default: 0 },
    estimatesChecked: { type: Number, required: true, default: 0 },
    estimatesUpdated: { type: Number, required: true, default: 0 },
    sourcesOk: { type: [String], default: [] },
    sourcesFailed: {
      type: [{ _id: false, source: String, reason: String }],
      default: [],
    },
  },
  { timestamps: true }
);

/**
 * The two reads: "when did a refresh last succeed?" (the due check) and "show me
 * recent runs" (the admin view). Both walk this index backwards from the top.
 */
priceRefreshRunSchema.index({ status: 1, finishedAt: -1 });
priceRefreshRunSchema.index({ startedAt: -1 });

export const PriceRefreshRun = model<PriceRefreshRunDoc>("PriceRefreshRun", priceRefreshRunSchema);
