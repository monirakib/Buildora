import { Schema, model } from "mongoose";

/**
 * One step of the ECPS (RAJUK online permit) process. The guide page lists
 * these in order and the per-project tracker walks through them. Admin-editable
 * so the platform can follow RAJUK's process changes without a code change.
 */
export interface EcpsStepDoc {
  /** 1-based position in the process; steps are shown and walked in this order. */
  order: number;
  title: string;
  description: string;
  requiredDocuments: string[];
  createdAt: Date;
  updatedAt: Date;
}

const ecpsStepSchema = new Schema<EcpsStepDoc>(
  {
    order: { type: Number, required: true, unique: true, min: 1 },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, required: true, trim: true, maxlength: 1000 },
    requiredDocuments: { type: [String], default: [] },
  },
  { timestamps: true }
);

export const EcpsStep = model<EcpsStepDoc>("EcpsStep", ecpsStepSchema);
