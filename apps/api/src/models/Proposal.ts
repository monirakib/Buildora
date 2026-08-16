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
    // Neither carries `index: true` — both list queries also sort by createdAt,
    // so the compound indexes at the bottom cover them and a single-field index
    // here would just be a redundant prefix.
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    architect: { type: Schema.Types.ObjectId, ref: "User", required: true },
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

/**
 * The two proposal lists, both newest-first: the owner reading one project's
 * proposals, and an architect reading their own.
 *
 * The unique index above cannot serve either of them. It is partial, so it only
 * contains live proposals — a list that shows declined and withdrawn ones would
 * get wrong answers from it — and its second field is `architect`, not
 * `createdAt`, so the sort would still run in memory.
 */
proposalSchema.index({ project: 1, createdAt: -1 });
proposalSchema.index({ architect: 1, createdAt: -1 });

/**
 * The pending-proposal badge on the owner's project list
 * (projects.controller.ts) runs one aggregate that matches many projects at
 * once and groups by project:
 *
 *   $match { project: { $in: [...] }, status: PENDING }
 *
 * Both fields are equality matches here — `$in` is a set of equality tests, not
 * a range — so this index answers the match without touching the documents at
 * all. It is separate from {project, createdAt} above because that one orders by
 * date within a project, which does nothing to help find one status.
 */
proposalSchema.index({ project: 1, status: 1 });

export const Proposal = model<ProposalDoc>("Proposal", proposalSchema);
