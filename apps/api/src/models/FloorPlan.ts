import { Schema, model, Types } from "mongoose";
import {
  FurnitureKind,
  OpeningKind,
  RoomKind,
  type PlanFurniture,
  type PlanOpening,
  type PlanRoom,
  type PlanWall,
} from "@buildora/shared";

/**
 * One floor of a project's 2D plan — the layout the architect draws before any
 * 3D model exists. Geometry is stored exactly as the editor holds it (feet,
 * top-left origin), so loading a plan is a straight read with no conversion.
 *
 * There is **one document per floor**: `level` 0 is the ground floor, 1 the
 * first floor, and so on. Keeping floors in separate documents (rather than an
 * array inside one) means saving the 2nd floor never rewrites the ground
 * floor, and the FAR check can add up levels with a single query.
 */
export interface FloorPlanDoc {
  project: Types.ObjectId;
  level: number;
  walls: PlanWall[];
  rooms: PlanRoom[];
  openings: PlanOpening[];
  furniture: PlanFurniture[];
  gridStepFt: number;
  /** Who last saved this floor — shown under the canvas. */
  updatedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

/** `_id: false` on the sub-schemas — the editor supplies its own string ids. */
const wallSchema = new Schema<PlanWall>(
  {
    id: { type: String, required: true },
    x1: { type: Number, required: true },
    y1: { type: Number, required: true },
    x2: { type: Number, required: true },
    y2: { type: Number, required: true },
    thicknessIn: { type: Number, required: true, min: 2, max: 24 },
  },
  { _id: false }
);

const pointSchema = new Schema(
  {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
  },
  { _id: false }
);

// `kind` and `color` are optional: rooms drawn before room types existed have
// neither, and the editor falls back to its default tint for those.
const roomSchema = new Schema<PlanRoom>(
  {
    id: { type: String, required: true },
    name: { type: String, required: true, trim: true, maxlength: 40 },
    points: { type: [pointSchema], required: true },
    kind: { type: String, enum: Object.values(RoomKind) },
    color: { type: String },
  },
  { _id: false }
);

const furnitureSchema = new Schema<PlanFurniture>(
  {
    id: { type: String, required: true },
    kind: { type: String, enum: Object.values(FurnitureKind), required: true },
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    widthFt: { type: Number, required: true, min: 0.5, max: 60 },
    depthFt: { type: Number, required: true, min: 0.5, max: 60 },
    rotation: { type: Number, required: true, min: 0, max: 359 },
    label: { type: String, trim: true, maxlength: 40 },
  },
  { _id: false }
);

const openingSchema = new Schema<PlanOpening>(
  {
    id: { type: String, required: true },
    wallId: { type: String, required: true },
    offsetFt: { type: Number, required: true, min: 0 },
    widthFt: { type: Number, required: true, min: 0.5, max: 40 },
    kind: { type: String, enum: Object.values(OpeningKind), required: true },
  },
  { _id: false }
);

const floorPlanSchema = new Schema<FloorPlanDoc>(
  {
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    level: { type: Number, required: true, min: 0, max: 50 },
    walls: { type: [wallSchema], default: [] },
    rooms: { type: [roomSchema], default: [] },
    openings: { type: [openingSchema], default: [] },
    furniture: { type: [furnitureSchema], default: [] },
    gridStepFt: { type: Number, default: 1, min: 0.25, max: 10 },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

// A project has at most one plan per floor, so saving is an upsert on this key.
floorPlanSchema.index({ project: 1, level: 1 }, { unique: true });

export const FloorPlan = model<FloorPlanDoc>("FloorPlan", floorPlanSchema);
