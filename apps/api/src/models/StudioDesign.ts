import { Schema, model, Types } from "mongoose";
import type { StudioFloor } from "@buildora/shared";

/**
 * A project's BD Design Studio drawing — one document per project, holding the
 * whole building.
 *
 * The studio keeps every level in one in-memory object and rewrites all of it
 * on each autosave, so there is nothing to gain from splitting the floors into
 * separate documents the way `FloorPlan` does. One document also means the
 * "restore a version" path is a single write rather than a fan-out that could
 * half-succeed.
 *
 * `elements` is deliberately `Mixed`. A floor's elements are a heterogeneous
 * list — a wall has `a`/`b` endpoints, an opening has a `host` wall and an
 * offset, a stair has a rise and a run — and Mongoose sub-schemas cannot type a
 * discriminated array without either five parallel arrays or a stack of
 * discriminators. Either would force the studio's model to be reshaped on the
 * way in and out, and the whole point is that it isn't. The shape is checked
 * instead by a zod discriminated union in the controller, which validates the
 * variants properly and rejects anything that isn't one of them.
 */
export interface StudioDesignDoc {
  project: Types.ObjectId;
  name: string;
  unit: "ft" | "m";
  floors: StudioFloor[];
  active: number;
  v: number;
  /** Hour of day the 3D sun is set to. Absent means the studio's default. */
  sunHour?: number;
  /** Who last saved — the studio only lets the project's architect write. */
  updatedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Left ungenerified on purpose. Mongoose's types will not accept
 * `[Schema.Types.Mixed]` for a field the document type declares as
 * `StudioElement[]` — the whole point of Mixed is that it has no compile-time
 * shape. The parent schema below is still typed as `StudioDesignDoc`, so the
 * document this model hands back is typed; only the two intentionally
 * shapeless arrays lose their compile-time cover, and zod covers those in the
 * controller instead.
 */
const floorSchema = new Schema(
  {
    // The studio generates its own ids, so Mongoose must not add `_id` here or
    // it would come back on a field the editor doesn't know about.
    id: { type: String, required: true },
    name: { type: String, required: true },
    note: { type: String, default: "" },
    elevation: { type: Number, required: true },
    height: { type: Number, required: true },
    visible: { type: Boolean, default: true },
    floorMat: { type: String, default: "oak" },
    ceilMat: { type: String, default: "plaster" },
    elements: { type: [Schema.Types.Mixed], default: [] },
    roomMeta: { type: [Schema.Types.Mixed], default: [] },
  },
  { _id: false }
);

const studioDesignSchema = new Schema<StudioDesignDoc>(
  {
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true, unique: true },
    name: { type: String, required: true, default: "Modern Villa" },
    unit: { type: String, enum: ["ft", "m"], default: "ft" },
    floors: { type: [floorSchema], default: [] },
    active: { type: Number, default: 0, min: 0, max: 50 },
    v: { type: Number, default: 1 },
    // Hour of day for the 3D sun. No default: an absent value means "the
    // studio's own", which keeps designs saved before this existed unchanged.
    sunHour: { type: Number, min: 0, max: 24 },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

export const StudioDesign = model<StudioDesignDoc>("StudioDesign", studioDesignSchema);
