import { Schema, model, Types } from "mongoose";
import { BuildingType, ProjectStatus } from "@buildora/shared";

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
  landAreaKatha: number;
  buildingType: BuildingType;
  floors: number;
  budgetMinBdt?: number;
  budgetMaxBdt?: number;
  status: ProjectStatus;
  createdAt: Date;
  updatedAt: Date;
}

const projectSchema = new Schema<ProjectDoc>(
  {
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    architect: { type: Schema.Types.ObjectId, ref: "User", index: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, required: true, trim: true, maxlength: 3000 },
    address: { type: String, required: true, trim: true, maxlength: 200 },
    areaName: { type: String, required: true, trim: true, maxlength: 80 },
    landAreaKatha: { type: Number, required: true, min: 0 },
    buildingType: { type: String, enum: Object.values(BuildingType), required: true },
    floors: { type: Number, required: true, min: 1, max: 50 },
    budgetMinBdt: { type: Number, min: 0 },
    budgetMaxBdt: { type: Number, min: 0 },
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
