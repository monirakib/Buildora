import { Schema, model, type Types } from "mongoose";

/**
 * The handover package — what turns "the builder left" into a documented end.
 *
 * Before this, ProjectStatus.COMPLETED meant only that the owner had clicked a
 * button. This is the evidence behind it: the RAJUK occupancy certificate that
 * legally permits the building to be used, and every warranty with the date it
 * runs out.
 *
 * One per project, which is why `project` is unique — a building is handed over
 * once, and a second record would just be a way to lose the first.
 */
export interface WarrantyEntryDoc {
  item: string;
  provider: string;
  months: number;
  /** ISO "YYYY-MM-DD" — kept as strings, like every other date the user types. */
  startsAt: string;
  /**
   * Stored rather than computed on read. A warranty's end date is a commitment
   * made on a particular day; recomputing it later would let a change to the
   * rules silently rewrite what somebody was promised.
   */
  expiresAt: string;
  documentUrl?: string;
}

export interface HandoverDoc {
  project: Types.ObjectId;
  occupancyCertificateUrl?: string;
  occupancyCertificateNo?: string;
  handedOverAt?: string;
  notes?: string;
  warranties: WarrantyEntryDoc[];
  acceptedByOwner: boolean;
  acceptedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const warrantySchema = new Schema<WarrantyEntryDoc>(
  {
    item: { type: String, required: true, trim: true, maxlength: 160 },
    provider: { type: String, required: true, trim: true, maxlength: 160 },
    months: { type: Number, required: true, min: 1, max: 600 },
    startsAt: { type: String, required: true, trim: true },
    expiresAt: { type: String, required: true, trim: true },
    documentUrl: { type: String, trim: true },
  },
  { _id: false }
);

const handoverSchema = new Schema<HandoverDoc>(
  {
    project: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      unique: true,
      index: true,
    },
    occupancyCertificateUrl: { type: String, trim: true },
    occupancyCertificateNo: { type: String, trim: true, maxlength: 60 },
    handedOverAt: { type: String, trim: true },
    notes: { type: String, trim: true, maxlength: 2000 },
    warranties: { type: [warrantySchema], default: [] },
    acceptedByOwner: { type: Boolean, default: false },
    acceptedAt: { type: Date },
  },
  { timestamps: true }
);

export const Handover = model<HandoverDoc>("Handover", handoverSchema);
