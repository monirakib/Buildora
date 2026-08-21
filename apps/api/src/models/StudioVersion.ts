import { Schema, model, Types } from "mongoose";
import type { StudioDesign as StudioDesignData } from "@buildora/shared";

/**
 * A named snapshot of a studio design — what the Layers tab lists under
 * "Versions" and restores from.
 *
 * These live in their own collection rather than as an array on
 * `StudioDesign`. A project keeps twelve of them, each a complete copy of the
 * building plus a thumbnail, and putting that inside the live document would
 * mean every 500 ms autosave rewrote a megabyte of history it never reads. The
 * list view also only needs the label, the date and the thumbnail, so `data`
 * is fetched by id and only when someone actually opens a version.
 */
export interface StudioVersionDoc {
  project: Types.ObjectId;
  /** The studio's own id for this version, not the Mongo `_id`. */
  vid: string;
  label: string;
  /** Epoch milliseconds, as the studio recorded it. */
  at: number;
  /** A 132x100 JPEG data URL of the 2D plan. Empty if the canvas was blank. */
  thumb: string;
  design: StudioDesignData;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const studioVersionSchema = new Schema<StudioVersionDoc>(
  {
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    vid: { type: String, required: true },
    label: { type: String, required: true },
    at: { type: Number, required: true },
    thumb: { type: String, default: "" },
    // Stored whole, for the same reason StudioDesign stores elements as Mixed:
    // a version has to restore to exactly what was drawn.
    design: { type: Schema.Types.Mixed, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

// Listing is always "this project's versions, newest first", and restoring is
// a lookup by the studio's own id within a project.
studioVersionSchema.index({ project: 1, at: -1 });
studioVersionSchema.index({ project: 1, vid: 1 }, { unique: true });

export const StudioVersion = model<StudioVersionDoc>("StudioVersion", studioVersionSchema);
