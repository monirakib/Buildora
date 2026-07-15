import { Schema, model } from "mongoose";
import { LandUse } from "@buildora/shared";

/**
 * One DAP (Detailed Area Plan) zone record: which locality it covers and the
 * building limits that apply there. Admin-editable — the checker reads these
 * from the database, never from hardcoded tables.
 */
export interface DapZoneDoc {
  areaName: string;
  zoneCode: string;
  landUse: LandUse;
  /** Maximum floor-area ratio allowed on a plot. */
  maxFar: number;
  /** Maximum ground coverage as a percentage of the plot. */
  maxGroundCoveragePct: number;
  maxFloors?: number;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const dapZoneSchema = new Schema<DapZoneDoc>(
  {
    areaName: { type: String, required: true, trim: true, maxlength: 80, index: true },
    zoneCode: { type: String, required: true, trim: true, maxlength: 30 },
    landUse: { type: String, enum: Object.values(LandUse), required: true },
    maxFar: { type: Number, required: true, min: 0 },
    maxGroundCoveragePct: { type: Number, required: true, min: 0, max: 100 },
    maxFloors: { type: Number, min: 1, max: 100 },
    notes: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true }
);

export const DapZone = model<DapZoneDoc>("DapZone", dapZoneSchema);
