import { Schema, model } from "mongoose";
import { LandUse } from "@buildora/shared";

/**
 * RAJUK permit fee rate for one land-use category: a flat base fee plus a
 * per-square-metre rate on the proposed floor area. Admin-editable — the
 * calculator reads these from the database.
 */
export interface FeeRuleDoc {
  category: LandUse;
  label: string;
  baseFeeBdt: number;
  ratePerSqmBdt: number;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const feeRuleSchema = new Schema<FeeRuleDoc>(
  {
    // One rule per category — the calculator looks rates up by category.
    category: { type: String, enum: Object.values(LandUse), required: true, unique: true },
    label: { type: String, required: true, trim: true, maxlength: 80 },
    baseFeeBdt: { type: Number, required: true, min: 0 },
    ratePerSqmBdt: { type: Number, required: true, min: 0 },
    notes: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true }
);

export const FeeRule = model<FeeRuleDoc>("FeeRule", feeRuleSchema);
