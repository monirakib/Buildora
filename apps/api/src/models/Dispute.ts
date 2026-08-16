import { Schema, model, type Types } from "mongoose";
import { DisputeResolution, DisputeScope, DisputeStatus } from "@buildora/shared";

/**
 * A disagreement over money that is already in escrow.
 *
 * The escrow flows only had happy paths: the client approves and the money is
 * released, or the work is cancelled before anything moved. This is the third
 * case — the money is held, the work is done or claimed done, and the two sides
 * disagree about whether it counts.
 *
 * Only a supervisor can end one, and while it is live the disputed amount is
 * frozen: the guards in the contract, structural and build controllers refuse
 * to release, approve or cancel underneath an open dispute. That is the whole
 * point — without the freeze, whoever clicked first would win.
 */
export interface DisputeEvidenceDoc {
  caption: string;
  fileUrl: string;
  uploadedBy: Types.ObjectId;
  at: Date;
}

export interface DisputeDoc {
  project: Types.ObjectId;
  scope: DisputeScope;
  /** Contract, engagement or milestone id — which, depends on `scope`. */
  target: Types.ObjectId;
  /** Readable name for the target, captured at raise time. */
  targetLabel: string;
  raisedBy: Types.ObjectId;
  against: Types.ObjectId;
  reason: string;
  amountClaimedBdt?: number;
  evidence: DisputeEvidenceDoc[];
  status: DisputeStatus;
  resolution?: DisputeResolution;
  resolutionNote?: string;
  refundBdt?: number;
  releasedBdt?: number;
  resolvedBy?: Types.ObjectId;
  resolvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const evidenceSchema = new Schema<DisputeEvidenceDoc>(
  {
    caption: { type: String, required: true, trim: true, maxlength: 200 },
    fileUrl: { type: String, required: true, trim: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const disputeSchema = new Schema<DisputeDoc>(
  {
    // None of these carry `index: true`: every one of them leads a compound
    // index at the bottom of this file, and a single-field index that is already
    // the prefix of a compound one earns nothing.
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    scope: { type: String, enum: Object.values(DisputeScope), required: true },
    // Paired with status below — the hot query is "is anything live against this
    // contract right now", run before every release.
    target: { type: Schema.Types.ObjectId, required: true },
    targetLabel: { type: String, required: true, trim: true, maxlength: 160 },
    raisedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    against: { type: Schema.Types.ObjectId, ref: "User", required: true },
    reason: { type: String, required: true, trim: true, maxlength: 2000 },
    amountClaimedBdt: { type: Number, min: 0 },
    evidence: { type: [evidenceSchema], default: [] },
    status: {
      type: String,
      enum: Object.values(DisputeStatus),
      default: DisputeStatus.OPEN,
    },
    resolution: { type: String, enum: Object.values(DisputeResolution) },
    resolutionNote: { type: String, trim: true, maxlength: 2000 },
    refundBdt: { type: Number, min: 0 },
    releasedBdt: { type: Number, min: 0 },
    resolvedBy: { type: Schema.Types.ObjectId, ref: "User" },
    resolvedAt: { type: Date },
  },
  { timestamps: true }
);

// The freeze check runs on every release, so it gets its own compound index.
disputeSchema.index({ target: 1, status: 1 });

/**
 * `/api/disputes/mine` — `{ $or: [{ raisedBy: me }, { against: me }] }`,
 * newest-first. One index per `$or` branch, as elsewhere.
 */
disputeSchema.index({ raisedBy: 1, createdAt: -1 });
disputeSchema.index({ against: 1, createdAt: -1 });

/**
 * The admin dispute queue. Note the **ascending** createdAt: unlike every other
 * list here, that screen sorts oldest-first, because the oldest unresolved
 * dispute is the one that most needs attention. The index direction matches the
 * query so the sort is free.
 */
disputeSchema.index({ status: 1, createdAt: 1 });

/** One project's disputes, newest-first, on the project page. */
disputeSchema.index({ project: 1, createdAt: -1 });

export const Dispute = model<DisputeDoc>("Dispute", disputeSchema);
