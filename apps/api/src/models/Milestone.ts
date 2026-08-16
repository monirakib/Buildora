import { Schema, model, Types } from "mongoose";
import { InspectionVerdict, MilestoneStatus } from "@buildora/shared";
import { protectLedger, type LedgerProtected } from "../services/ledgerIntegrity";

/**
 * One construction stage, and the escrow tranche that pays for it.
 *
 * Inspections are embedded rather than given their own collection: they are
 * only ever read as part of the milestone they belong to, and a milestone with
 * its inspection history in one document is what the release decision is
 * actually made from. They keep their `_id` so each can be linked to and
 * printed on its own.
 *
 * `amountBdt` is frozen when the schedule is created. Recomputing it from the
 * contract sum on every read would silently re-price stages that have already
 * been funded or paid, which is exactly what a ledger must never do.
 */
export interface ChecklistResultDoc {
  label: string;
  passed: boolean;
  note?: string;
}

export interface InspectionLocationDoc {
  lat: number;
  lng: number;
  address?: string;
  distanceFromPlotM?: number;
}

export interface InspectionDoc {
  _id: Types.ObjectId;
  inspector: Types.ObjectId;
  templateName: string;
  results: ChecklistResultDoc[];
  verdict: InspectionVerdict;
  notes?: string;
  photoUrls: string[];
  signature: string;
  location?: InspectionLocationDoc;
  inspectedAt: Date;
}

export interface MilestoneDoc extends LedgerProtected {
  buildContract: Types.ObjectId;
  project: Types.ObjectId;
  order: number;
  title: string;
  description?: string;
  amountPct: number;
  amountBdt: number;
  targetDate?: Date;
  status: MilestoneStatus;
  claimedAt?: Date;
  releasedAt?: Date;
  releasedAmountBdt?: number;
  inspections: InspectionDoc[];
  createdAt: Date;
  updatedAt: Date;
}

const checklistResultSchema = new Schema<ChecklistResultDoc>(
  {
    label: { type: String, required: true, trim: true, maxlength: 200 },
    passed: { type: Boolean, required: true },
    note: { type: String, trim: true, maxlength: 500 },
  },
  { _id: false }
);

const inspectionLocationSchema = new Schema<InspectionLocationDoc>(
  {
    lat: { type: Number, required: true, min: -90, max: 90 },
    lng: { type: Number, required: true, min: -180, max: 180 },
    address: { type: String, trim: true, maxlength: 300 },
    distanceFromPlotM: { type: Number, min: 0 },
  },
  { _id: false }
);

// Keeps its _id: an inspection is a signed record that gets linked to and
// printed on its own, so it needs a stable identifier.
const inspectionSchema = new Schema<InspectionDoc>({
  inspector: { type: Schema.Types.ObjectId, ref: "User", required: true },
  templateName: { type: String, required: true, trim: true, maxlength: 120 },
  results: { type: [checklistResultSchema], default: [] },
  verdict: { type: String, enum: Object.values(InspectionVerdict), required: true },
  notes: { type: String, trim: true, maxlength: 2000 },
  photoUrls: { type: [String], default: [] },
  // Typed by the engineer as they file — their certification of this stage.
  signature: { type: String, required: true, trim: true, maxlength: 120 },
  location: { type: inspectionLocationSchema, default: undefined },
  inspectedAt: { type: Date, default: Date.now },
});

const milestoneSchema = new Schema<MilestoneDoc>(
  {
    buildContract: {
      type: Schema.Types.ObjectId,
      ref: "BuildContract",
      required: true,
      index: true,
    },
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    order: { type: Number, required: true, min: 1 },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, trim: true, maxlength: 1000 },
    amountPct: { type: Number, required: true, min: 0, max: 100 },
    amountBdt: { type: Number, required: true, min: 0 },
    targetDate: { type: Date },
    status: {
      type: String,
      enum: Object.values(MilestoneStatus),
      default: MilestoneStatus.PENDING,
      required: true,
    },
    claimedAt: { type: Date },
    releasedAt: { type: Date },
    releasedAmountBdt: { type: Number, min: 0 },
    inspections: { type: [inspectionSchema], default: [] },
  },
  { timestamps: true }
);

/** The schedule always reads in build order, and positions can't collide. */
milestoneSchema.index({ buildContract: 1, order: 1 }, { unique: true });

/**
 * The tranche figures and the status gate that decides when they pay out.
 * `status` is in here because moving a milestone straight to RELEASED is the
 * cheapest possible way to steal from the escrow chain.
 */
protectLedger(milestoneSchema, (doc) => ({
  buildContract: String(doc.buildContract),
  order: doc.order,
  amountBdt: doc.amountBdt,
  amountPct: doc.amountPct,
  releasedAmountBdt: doc.releasedAmountBdt,
  status: doc.status,
}));

export const Milestone = model<MilestoneDoc>("Milestone", milestoneSchema);
