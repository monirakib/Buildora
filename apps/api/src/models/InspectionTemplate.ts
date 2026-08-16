import { Schema, model } from "mongoose";

/**
 * A named checklist an engineer works through during a milestone inspection.
 *
 * In the database, admin-editable, for the same reason DAP zones and RAJUK fees
 * are: what a foundation inspection must cover is a rule, and rules change
 * without a redeploy. The engineer picks a template when they file, and the
 * items are **copied onto the inspection** at that moment — editing a template
 * afterwards must never rewrite what somebody already signed.
 */
export interface InspectionTemplateDoc {
  name: string;
  description?: string;
  items: string[];
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const inspectionTemplateSchema = new Schema<InspectionTemplateDoc>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120, unique: true },
    description: { type: String, trim: true, maxlength: 500 },
    items: { type: [String], default: [] },
    active: { type: Boolean, required: true, default: true },
  },
  { timestamps: true }
);

/**
 * The picker only ever offers active templates, in name order.
 *
 * The unique index on `name` sorts correctly but cannot filter on `active`, so
 * it would still read the inactive ones and discard them. This is a small
 * collection either way — it is here for consistency, not because it is hot.
 */
inspectionTemplateSchema.index({ active: 1, name: 1 });

export const InspectionTemplate = model<InspectionTemplateDoc>(
  "InspectionTemplate",
  inspectionTemplateSchema
);
