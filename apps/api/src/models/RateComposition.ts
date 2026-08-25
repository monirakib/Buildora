import { Schema, Types, model } from "mongoose";
import {
  CostComponentKind,
  ProductCategory,
  compositionSumsToOne,
  type CostComponent,
} from "@buildora/shared";

/**
 * What one BOQ rate is actually made of.
 *
 * services/marketDrift has always been able to see that cement moved 8% and has
 * always refused to do anything with it, for a reason worth repeating because it
 * is the reason this collection exists:
 *
 *     "RCC works (1:1.5:3) including shuttering" — 520 BDT/cft
 *
 * is not a cement price. It is cement plus sand plus wages plus formwork, added
 * up. Multiplying the whole 520 by a cement movement produces a number that
 * looks authoritative and means nothing.
 *
 * So each rate is split into slices with a stated share. An 8% cement move
 * reprices the ~30% of that 520 which is cement and leaves the wages alone. The
 * arithmetic becomes defensible, and — a second win that matters as much — the
 * labour share stops being invisible. Before this, wages were buried inside a
 * composite figure with no way to see them, let alone adjust them.
 *
 * The fractions are indicative Dhaka proportions, not measurements. They carry
 * the same standing as the seeded rates themselves and are admin-editable for
 * the same reason. The point is not that cement is exactly 30% of RCC; it is
 * that the 30% is written down where somebody can argue with it.
 */
export interface CostComponentDoc extends CostComponent {
  /**
   * This slice's query vector, set by the weekly job for MATERIAL slices only —
   * labour and fixed slices have no price to retrieve.
   *
   * Embedding the *query* side offline, alongside the price side, is what keeps
   * the model off the request path entirely: retrieval is then a dot product
   * between two stored arrays. See services/embeddings for the full argument.
   */
  embedding?: number[];
}

export interface RateCompositionDoc {
  boqRate: Types.ObjectId;
  /**
   * The rate's description, copied at seed time. Denormalised on purpose: it
   * makes the table readable on its own, and it is part of the text each
   * component is embedded from.
   */
  rateDescription: string;
  components: CostComponentDoc[];
  /**
   * Which model produced the component vectors. Changing the embedding model
   * makes old vectors incomparable with new ones, so this is what lets the job
   * re-embed exactly what is stale rather than the whole table.
   */
  componentsEmbeddedWith?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const componentSchema = new Schema<CostComponentDoc>(
  {
    kind: { type: String, enum: Object.values(CostComponentKind), required: true },
    // Set only on MATERIAL slices — it is the link to a live price. Labour and
    // fixed slices have no category because nothing tracks them.
    category: { type: String, enum: Object.values(ProductCategory) },
    label: { type: String, required: true, trim: true, maxlength: 80 },
    fraction: { type: Number, required: true, min: 0, max: 1 },
    // What this slice was costed at when the rate was set. Repricing divides by
    // it, so a slice without one simply is not repriced.
    baselinePriceBdt: { type: Number, min: 0 },
    baselineUnit: { type: String, trim: true, maxlength: 30 },
    embedding: { type: [Number], default: undefined },
  },
  { _id: false }
);

const rateCompositionSchema = new Schema<RateCompositionDoc>(
  {
    // One composition per rate — repricing looks it up by the rate it describes.
    boqRate: {
      type: Schema.Types.ObjectId,
      ref: "BoqRate",
      required: true,
      unique: true,
    },
    rateDescription: { type: String, required: true, trim: true, maxlength: 200 },
    componentsEmbeddedWith: { type: String, trim: true, maxlength: 80 },
    components: {
      type: [componentSchema],
      required: true,
      validate: {
        // A composition whose slices sum to 0.8 would quietly under-price every
        // estimate built from it, and nothing downstream would notice. Rejecting
        // it at write time is the only place this is cheap to catch.
        validator: (components: CostComponentDoc[]) =>
          components.length > 0 && compositionSumsToOne(components),
        message: "Component fractions must sum to 1",
      },
    },
    notes: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true }
);

export const RateComposition = model<RateCompositionDoc>("RateComposition", rateCompositionSchema);
