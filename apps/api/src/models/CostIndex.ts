import { Schema, model } from "mongoose";

/**
 * The construction-materials inflation index, one row per month.
 *
 * Per-item prices cover the materials Buildora tracks. This covers everything it
 * doesn't. A BoqRate line last edited fourteen months ago is wrong by roughly
 * whatever this index has done in those fourteen months, and until now the
 * estimator had no way to know that — rates simply sat at whatever an admin last
 * typed, with no sense of how long ago that was.
 *
 * **Entered by hand, on purpose.** BBS publishes as a PDF on its own schedule;
 * a two-minute monthly admin task is worth more than a parser that breaks
 * silently and leaves the figure frozen without anyone noticing.
 *
 * `series` exists so a second index — a wage index, a regional one — can be
 * added later without touching this schema.
 */
export interface CostIndexDoc {
  series: string;
  /** The month this describes, as "YYYY-MM". */
  period: string;
  /** Value against the series base, e.g. 118.4 where the base period is 100. */
  indexValue: number;
  sourceName: string;
  sourceUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

const costIndexSchema = new Schema<CostIndexDoc>(
  {
    series: { type: String, required: true, trim: true, maxlength: 60 },
    // Stored as a string rather than a Date because it names a month, not an
    // instant — and "YYYY-MM" sorts correctly as text, so no parsing is needed
    // to read the series in order.
    period: { type: String, required: true, trim: true, match: /^\d{4}-\d{2}$/ },
    indexValue: { type: Number, required: true, min: 0 },
    sourceName: { type: String, required: true, trim: true, maxlength: 120 },
    sourceUrl: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true }
);

/** One value per series per month, and the natural read is newest month first. */
costIndexSchema.index({ series: 1, period: -1 }, { unique: true });

export const CostIndex = model<CostIndexDoc>("CostIndex", costIndexSchema);
