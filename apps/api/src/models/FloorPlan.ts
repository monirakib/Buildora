import { Schema, model, Types } from "mongoose";
import {
  ColumnShape,
  DEFAULT_CEILING_FT,
  DEFAULT_SLAB_FT,
  DoorSwing,
  FurnitureKind,
  HingeSide,
  OpeningKind,
  PlanMaterial,
  RoomKind,
  StairRailSide,
  type PlanColumn,
  type PlanFurniture,
  type PlanOpening,
  type PlanRoom,
  type PlanStair,
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
  stairs: PlanStair[];
  columns: PlanColumn[];
  gridStepFt: number;
  ceilingHeightFt: number;
  slabThicknessFt: number;
  floorMaterial?: PlanMaterial;
  ceilingMaterial?: PlanMaterial;
  showCeiling: boolean;
  /** Who last saved this floor — shown under the canvas. */
  updatedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

/** Every 3D finish field takes the same shape, and none of them is required. */
const materialField = { type: String, enum: Object.values(PlanMaterial) } as const;

/** `_id: false` on the sub-schemas — the editor supplies its own string ids. */
const wallSchema = new Schema<PlanWall>(
  {
    id: { type: String, required: true },
    x1: { type: Number, required: true },
    y1: { type: Number, required: true },
    x2: { type: Number, required: true },
    y2: { type: Number, required: true },
    thicknessIn: { type: Number, required: true, min: 2, max: 24 },
    // Absent means "the floor's ceiling height" — see PlanWall.heightFt.
    heightFt: { type: Number, min: 1, max: 30 },
    material: materialField,
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
    floorMaterial: materialField,
    ceilingMaterial: materialField,
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
    heightFt: { type: Number, min: 0.2, max: 12 },
    // Underside above the floor: a split AC hangs at ~7'2", a wall TV at ~4'.
    mountFt: { type: Number, min: 0, max: 12 },
    material: materialField,
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
    heightFt: { type: Number, min: 1, max: 12 },
    sillFt: { type: Number, min: 0, max: 10 },
    hinge: { type: String, enum: Object.values(HingeSide) },
    swing: { type: String, enum: Object.values(DoorSwing) },
    openDeg: { type: Number, min: 0, max: 120 },
    frameMaterial: materialField,
  },
  { _id: false }
);

const stairSchema = new Schema<PlanStair>(
  {
    id: { type: String, required: true },
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    widthFt: { type: Number, required: true, min: 2, max: 12 },
    runFt: { type: Number, required: true, min: 3, max: 40 },
    rotation: { type: Number, required: true, min: 0, max: 359 },
    // Absent climbs the whole floor-to-floor height of this level.
    riseFt: { type: Number, min: 3, max: 25 },
    railSide: { type: String, enum: Object.values(StairRailSide) },
    material: materialField,
  },
  { _id: false }
);

const columnSchema = new Schema<PlanColumn>(
  {
    id: { type: String, required: true },
    // Unlike furniture, x/y is the column's centre — that is how a grid of
    // columns is set out on a structural drawing.
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    sizeFt: { type: Number, required: true, min: 0.5, max: 5 },
    shape: { type: String, enum: Object.values(ColumnShape) },
    heightFt: { type: Number, min: 1, max: 30 },
    material: materialField,
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
    stairs: { type: [stairSchema], default: [] },
    columns: { type: [columnSchema], default: [] },
    gridStepFt: { type: Number, default: 1, min: 0.25, max: 10 },
    // A plan saved before the 3D studio existed has none of these fields, and
    // Mongoose hands back the defaults when it hydrates the document — so every
    // old floor gets a sensible Dhaka ceiling without a migration script.
    ceilingHeightFt: { type: Number, default: DEFAULT_CEILING_FT, min: 6, max: 20 },
    slabThicknessFt: { type: Number, default: DEFAULT_SLAB_FT, min: 0.25, max: 2 },
    floorMaterial: materialField,
    ceilingMaterial: materialField,
    showCeiling: { type: Boolean, default: false },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

// A project has at most one plan per floor, so saving is an upsert on this key.
floorPlanSchema.index({ project: 1, level: 1 }, { unique: true });

export const FloorPlan = model<FloorPlanDoc>("FloorPlan", floorPlanSchema);
