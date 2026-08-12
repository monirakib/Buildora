import { Schema, model } from "mongoose";

/**
 * One line of the Bill of Quantities rate table.
 *
 * Two jobs, and both are why this lives in the database rather than in code:
 *
 *   1. `quantityPerSqft` turns a built-up area into a starting quantity, so an
 *      owner drafting a tender gets a BOQ pre-filled from the floor plan they
 *      already drew instead of a blank table.
 *   2. `ratePerUnitBdt` is the platform's guide price, shown to the owner while
 *      they compare bids — and never sent to a contractor, because publishing
 *      it would anchor every bid to it.
 *
 * Construction rates move with the market and vary by city. Hardcoding them
 * would mean a redeploy every time cement moves, which is exactly the rule
 * CLAUDE.md sets for DAP zones and RAJUK fees.
 */
export interface BoqRateDoc {
  description: string;
  unit: string;
  ratePerUnitBdt: number;
  /**
   * How much of this item a square foot of built-up area typically needs.
   * Zero for items an owner should quantify themselves (a lift, a generator).
   */
  quantityPerSqft: number;
  /** Groups lines in the drafting table, e.g. "Substructure", "Finishes". */
  category: string;
  /** Sort position, so the BOQ reads in build order rather than alphabetically. */
  order: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const boqRateSchema = new Schema<BoqRateDoc>(
  {
    description: { type: String, required: true, trim: true, maxlength: 200 },
    unit: { type: String, required: true, trim: true, maxlength: 20 },
    ratePerUnitBdt: { type: Number, required: true, min: 0 },
    quantityPerSqft: { type: Number, required: true, min: 0, default: 0 },
    category: { type: String, required: true, trim: true, maxlength: 60 },
    order: { type: Number, required: true, default: 0 },
    active: { type: Boolean, required: true, default: true },
  },
  { timestamps: true }
);

// The drafting table reads every active rate in build order, every time.
boqRateSchema.index({ active: 1, order: 1 });

export const BoqRate = model<BoqRateDoc>("BoqRate", boqRateSchema);
