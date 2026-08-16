import { Schema, model, type Types } from "mongoose";

/**
 * A land owner's rating of an architect.
 *
 * A review is tied to a contract, not to a profile: it can only be written once
 * that contract reaches COMPLETED, so every score on the platform comes from
 * someone who actually hired, paid and finished a project with that architect.
 * The unique index on `contract` is what enforces one review per job — without
 * it a single client could rate the same architect repeatedly and move their
 * average on their own.
 */
export interface ReviewDoc {
  contract: Types.ObjectId;
  project: Types.ObjectId;
  architect: Types.ObjectId;
  author: Types.ObjectId;
  /** 1–5 whole stars. */
  rating: number;
  comment?: string;
  createdAt: Date;
  updatedAt: Date;
}

const reviewSchema = new Schema<ReviewDoc>(
  {
    contract: { type: Schema.Types.ObjectId, ref: "Contract", required: true, unique: true },
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    // Covered by the {architect, createdAt} index below.
    architect: { type: Schema.Types.ObjectId, ref: "User", required: true },
    // Kept as a plain index: nothing lists an author's reviews in date order,
    // it is only ever looked up directly.
    author: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, trim: true, maxlength: 1000 },
  },
  { timestamps: true }
);

/** A professional's public reviews, newest-first, on their profile page. */
reviewSchema.index({ architect: 1, createdAt: -1 });

export const Review = model<ReviewDoc>("Review", reviewSchema);
