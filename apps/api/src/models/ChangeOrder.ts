import { Schema, model, type Types } from "mongoose";
import { ChangeOrderStatus } from "@buildora/shared";

/**
 * A variation to a live construction contract.
 *
 * Real builds change: a soil report forces a deeper foundation, an owner
 * upgrades the finishes, a wall gets deleted. Without this the only options
 * were an off-platform side deal — which escrow cannot protect — or cancelling
 * the contract outright.
 *
 * Approving one moves the contract sum and the programme, and (when the change
 * costs money) appends a milestone for it, so the variation is funded, inspected
 * and released through exactly the same machinery as the original scope. No
 * second payment path.
 */
export interface ChangeOrderDoc {
  project: Types.ObjectId;
  buildContract: Types.ObjectId;
  raisedBy: Types.ObjectId;
  title: string;
  description: string;
  /** Signed: negative means work removed and money coming off the contract. */
  amountDeltaBdt: number;
  timelineDeltaWeeks: number;
  status: ChangeOrderStatus;
  decisionNote?: string;
  decidedAt?: Date;
  /** The milestone created to carry the extra cost, when there was one. */
  milestone?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const changeOrderSchema = new Schema<ChangeOrderDoc>(
  {
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    buildContract: {
      type: Schema.Types.ObjectId,
      ref: "BuildContract",
      required: true,
      index: true,
    },
    raisedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, required: true, trim: true, maxlength: 2000 },
    // No `min` — a variation that removes work is a real and useful thing, and
    // a schema that only allows increases would quietly encourage padding.
    amountDeltaBdt: { type: Number, required: true },
    timelineDeltaWeeks: { type: Number, default: 0 },
    status: {
      type: String,
      enum: Object.values(ChangeOrderStatus),
      default: ChangeOrderStatus.PROPOSED,
      index: true,
    },
    decisionNote: { type: String, trim: true, maxlength: 1000 },
    decidedAt: { type: Date },
    milestone: { type: Schema.Types.ObjectId, ref: "Milestone" },
  },
  { timestamps: true }
);

export const ChangeOrder = model<ChangeOrderDoc>("ChangeOrder", changeOrderSchema);
