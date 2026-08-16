import { Schema, model, Types } from "mongoose";
import { BuildingType, ProjectStatus, type PlotLocation } from "@buildora/shared";

/**
 * A land owner's construction project. It starts as a brief (what they want to
 * build, where, and with what budget); architects respond with proposals, and
 * once one is accepted the project carries the whole journey — concept, design,
 * permits, construction — through `status`. `architect` is set on acceptance,
 * `engineer` when the owner appoints one for the structural drawings, and
 * `contractor` when a bid is awarded.
 */
export interface ProjectDoc {
  owner: Types.ObjectId;
  architect?: Types.ObjectId;
  engineer?: Types.ObjectId;
  contractor?: Types.ObjectId;
  title: string;
  description: string;
  address: string;
  /** Locality used to match a DAP zone, e.g. "Dhanmondi". */
  areaName: string;
  /** Map pin the owner dropped, plus the outline they traced (both optional). */
  location?: PlotLocation;
  landAreaKatha: number;
  buildingType: BuildingType;
  floors: number;
  budgetMinBdt?: number;
  budgetMaxBdt?: number;
  // Plot details (all optional — older briefs won't have them)
  roadWidthFt?: number;
  plotFacing?: string;
  existingStructure?: boolean;
  soilTestDone?: boolean;
  // Building requirements
  unitsPerFloor?: number;
  bedroomsPerUnit?: number;
  parkingSpaces?: number;
  hasLift?: boolean;
  hasBasement?: boolean;
  hasRooftopAmenities?: boolean;
  // Preferences & readiness
  designStyle?: string;
  timeline?: string;
  ownershipDocsReady?: boolean;
  photoUrls?: string[];
  status: ProjectStatus;
  /**
   * Opaque token for the public read-only progress page, when the owner has
   * turned sharing on. Absent means not shared — and revoking is simply
   * unsetting it, which instantly breaks every link that was ever handed out.
   */
  shareToken?: string;
  createdAt: Date;
  updatedAt: Date;
}

/** One corner of a traced plot outline. `_id: false` keeps the array clean. */
const latLngSchema = new Schema(
  {
    lat: { type: Number, required: true, min: -90, max: 90 },
    lng: { type: Number, required: true, min: -180, max: 180 },
  },
  { _id: false }
);

/** The map pin, the address it resolved to, and the optional traced outline. */
const plotLocationSchema = new Schema(
  {
    lat: { type: Number, required: true, min: -90, max: 90 },
    lng: { type: Number, required: true, min: -180, max: 180 },
    formattedAddress: { type: String, trim: true, maxlength: 300 },
    boundary: { type: [latLngSchema], default: undefined },
    boundaryAreaSqft: { type: Number, min: 0 },
  },
  { _id: false }
);

const projectSchema = new Schema<ProjectDoc>(
  {
    // These four are how each role finds its own projects. None of them carries
    // `index: true` any more — every one of those lists also sorts by createdAt,
    // so the compound indexes at the bottom of this file serve them properly and
    // a single-field index here would be a redundant prefix of one.
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true },
    architect: { type: Schema.Types.ObjectId, ref: "User" },
    // Set when a structural engineer is appointed.
    engineer: { type: Schema.Types.ObjectId, ref: "User" },
    // Set when the owner awards a tender.
    contractor: { type: Schema.Types.ObjectId, ref: "User" },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, required: true, trim: true, maxlength: 3000 },
    address: { type: String, required: true, trim: true, maxlength: 200 },
    areaName: { type: String, required: true, trim: true, maxlength: 80 },
    location: { type: plotLocationSchema, default: undefined },
    landAreaKatha: { type: Number, required: true, min: 0 },
    buildingType: { type: String, enum: Object.values(BuildingType), required: true },
    floors: { type: Number, required: true, min: 1, max: 50 },
    budgetMinBdt: { type: Number, min: 0 },
    budgetMaxBdt: { type: Number, min: 0 },
    roadWidthFt: { type: Number, min: 1, max: 200 },
    plotFacing: { type: String, trim: true, maxlength: 40 },
    existingStructure: { type: Boolean },
    soilTestDone: { type: Boolean },
    unitsPerFloor: { type: Number, min: 1, max: 20 },
    bedroomsPerUnit: { type: Number, min: 1, max: 20 },
    parkingSpaces: { type: Number, min: 0, max: 200 },
    hasLift: { type: Boolean },
    hasBasement: { type: Boolean },
    hasRooftopAmenities: { type: Boolean },
    designStyle: { type: String, trim: true, maxlength: 60 },
    timeline: { type: String, trim: true, maxlength: 40 },
    ownershipDocsReady: { type: Boolean },
    photoUrls: { type: [String], default: undefined },
    // Sparse so the unique index only covers projects that are actually
    // shared; without sparse, every unshared project would collide on null.
    shareToken: { type: String, unique: true, sparse: true, index: true },
    // Not indexed on its own — see the {status, createdAt} index below.
    status: {
      type: String,
      enum: Object.values(ProjectStatus),
      default: ProjectStatus.DRAFT,
    },
  },
  { timestamps: true }
);

/**
 * The open-briefs board: `listOpenBriefs` matches `status: BRIEF_POSTED` and
 * sorts newest-first.
 *
 * Equality field first, sort field second. Read in that order the index is
 * already grouped by status and, inside each group, ordered by createdAt — so
 * MongoDB walks a contiguous run of entries in the order the query asked for
 * and never sorts anything. A single-field index on `status` alone would narrow
 * the search but still leave every matching document to be sorted in memory.
 *
 * The direction (-1) does not strictly matter — an index can be walked either
 * way — but it is written to match the query so the intent is obvious.
 */
projectSchema.index({ status: 1, createdAt: -1 });

/**
 * The four "my projects" lists. `listMyProjects` picks one of these fields based
 * on the caller's role and always sorts newest-first, so each gets the same
 * equality-then-sort treatment as the board above.
 *
 * Four narrow indexes rather than one wide one: a project has one owner and at
 * most one architect, engineer and contractor, and the query only ever filters
 * on a single one of them, so a combined index could not be used by any of them.
 */
projectSchema.index({ owner: 1, createdAt: -1 });
projectSchema.index({ architect: 1, createdAt: -1 });
projectSchema.index({ engineer: 1, createdAt: -1 });
projectSchema.index({ contractor: 1, createdAt: -1 });

export const Project = model<ProjectDoc>("Project", projectSchema);
