import { Schema, model, Types } from "mongoose";
import { BuildingType, ProjectStatus, type PlotLocation } from "@buildora/shared";

/**
 * A land owner's construction project. It starts as a brief (what they want to
 * build, where, and with what budget); architects respond with proposals, and
 * once one is accepted the project carries the whole journey — concept, design,
 * permits, construction — through `status`. `architect` is set on acceptance.
 */
export interface ProjectDoc {
  owner: Types.ObjectId;
  architect?: Types.ObjectId;
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
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    architect: { type: Schema.Types.ObjectId, ref: "User", index: true },
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
    status: {
      type: String,
      enum: Object.values(ProjectStatus),
      default: ProjectStatus.DRAFT,
      index: true,
    },
  },
  { timestamps: true }
);

export const Project = model<ProjectDoc>("Project", projectSchema);
