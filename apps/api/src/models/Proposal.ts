import { Schema, model, Types } from "mongoose";
import { ProposalStatus } from "@buildora/shared";

/**
 * An architect's response to a posted brief: a pitch plus the two fees the
 * plan defines — the small concept-brief fee (500–1000 BDT) and the full
 * design fee that will sit in escrow. Accepting a proposal assigns the
 * architect to the project and spawns the design contract.
 */
export interface ProposalDoc {
  project: Types.ObjectId;
  architect: Types.ObjectId;
  coverLetter: string;
  conceptFeeBdt: number;
  designFeeBdt: number;
  estimatedWeeks?: number;
  status: ProposalStatus;
  createdAt: Date;
  updatedAt: Date;
}

const proposalSchema = new Schema<ProposalDoc>(
  {
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    architect: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    coverLetter: { type: String, required: true, trim: true, maxlength: 2000 },
    conceptFeeBdt: { type: Number, required: true, min: 0 },
    designFeeBdt: { type: Number, required: true, min: 0 },
    estimatedWeeks: { type: Number, min: 1, max: 104 },
    status: {
      type: String,
      enum: Object.values(ProposalStatus),
      default: ProposalStatus.PENDING,
    },
  },
  { timestamps: true }
);

// One live proposal per architect per project. After a decline/withdrawal they
// may submit again, so uniqueness only covers the still-active states.
proposalSchema.index(
  { project: 1, architect: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: [ProposalStatus.PENDING, ProposalStatus.ACCEPTED] },
    },
  }
);

export const Proposal = model<ProposalDoc>("Proposal", proposalSchema);
